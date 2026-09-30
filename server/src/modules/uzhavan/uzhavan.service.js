/**
 * Uzhavan AI Service — Gemini LLM Integration Layer
 * Level 4 Architecture Reference: Section 6, 7, 8, 9, 10, 11
 *
 * Architecture chain (Level 1 rule, never violated):
 *   User → Uzhavan → Gemini → Intent + structured args → Tool → Auth → Business Service → MongoDB
 *
 * Gemini NEVER touches MongoDB directly.
 * Multi-turn conversation context managed via UzhavanConversation model.
 * Every AI action is audit-logged to UzhavanAuditLog model.
 */

import { GoogleGenAI } from '@google/genai';
import { callTool, getToolRegistry } from './uzhavan.tools.js';
import { buildGeminiFunctionDeclarations, buildUzhavanSystemInstruction } from './uzhavan.gemini.js';
import { UzhavanConversation } from './uzhavanConversation.model.js';
import { UzhavanAuditLog } from './uzhavanAuditLog.model.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { randomUUID } from 'crypto';

/**
 * Sensitive tools that ALWAYS require explicit confirmation before execution.
 */
const CONFIRMATION_REQUIRED_TOOLS = new Set([
  'deleteProduct',
  'completeOrder',
  'markNoShow',
  'recordOffPlatformSale',
  'cancelRequest'
]);

/**
 * Get or create a conversation session for the user.
 */
async function getOrCreateConversation(userId, conversationId) {
  if (conversationId) {
    const existing = await UzhavanConversation.findOne({ conversationId, userId });
    if (existing) return existing;
  }

  const newConversationId = conversationId || `conv-${userId}-${randomUUID().slice(0, 8)}`;
  return await UzhavanConversation.create({
    userId,
    conversationId: newConversationId,
    messages: [],
    contextData: { pendingIntent: null, draftArgs: {}, lastActiveTool: null },
    pendingConfirmation: { requiresConfirmation: false }
  });
}

/**
 * Write an audit log entry for every AI-initiated action.
 */
async function writeAuditLog({
  userId,
  conversationId,
  userCommand,
  language,
  detectedIntent,
  toolSelected,
  toolArguments,
  authorizationResult,
  executionResult,
  status,
  errorInfo
}) {
  try {
    await UzhavanAuditLog.create({
      userId,
      conversationId,
      userCommand,
      language,
      detectedIntent,
      toolSelected,
      toolArguments,
      authorizationResult,
      executionResult,
      status,
      errorInfo
    });
  } catch (err) {
    // Audit log failure never aborts the main action (fire-and-forget)
    console.error('[AUDIT LOG ERROR]', err.message);
  }
}

/**
 * Process a text or transcribed voice input using Gemini function-calling.
 * Returns structured response for the API controller.
 *
 * @param {{ text: string, userContext: object, language: string, conversationId: string }} input
 */
export async function processUserMessage({ text, userContext, language = 'en', conversationId }) {
  if (!text || text.trim().length === 0) {
    return {
      intent: 'EMPTY_INPUT',
      response: language === 'ta'
        ? 'நீங்கள் என்ன சொன்னீர்கள்? தயவுசெய்து மீண்டும் சொல்லுங்கள்.'
        : 'I didn\'t catch that. Please repeat what you\'d like to do.',
      requiresConfirmation: false
    };
  }

  // If AI not configured — return graceful degradation
  if (!env.ai.isConfigured) {
    return {
      intent: 'AI_UNAVAILABLE',
      response: language === 'ta'
        ? `உழவன் AI இன்னும் இயக்கப்படவில்லை. நீங்கள் சொன்னது: "${text}"`
        : `Uzhavan AI is not yet activated. You said: "${text}". Please use the app UI.`,
      requiresConfirmation: false,
      devNote: 'Set GEMINI_API_KEY in server/.env to enable Uzhavan AI.'
    };
  }

  let conversation;
  try {
    conversation = await getOrCreateConversation(userContext.id, conversationId);
  } catch (_dbErr) {
    // DB not available (e.g., test environment) — run without conversation persistence
    conversation = {
      conversationId: conversationId || `temp-${randomUUID().slice(0, 8)}`,
      messages: [],
      contextData: { pendingIntent: null, draftArgs: {}, lastActiveTool: null },
      pendingConfirmation: { requiresConfirmation: false },
      save: async () => {}
    };
  }

  // Check if there is a pending confirmation from a previous turn
  if (
    conversation.pendingConfirmation?.requiresConfirmation &&
    conversation.pendingConfirmation.expiresAt > new Date()
  ) {
    const lowerText = text.toLowerCase().trim();
    const isConfirmed = ['yes', 'confirm', 'ஆம்', 'சரி', 'ok', 'proceed', 'do it', 'haa'].some(
      (w) => lowerText.includes(w)
    );

    if (isConfirmed) {
      // Execute the pending confirmed tool
      const { toolName, params } = conversation.pendingConfirmation;
      conversation.pendingConfirmation = { requiresConfirmation: false };
      await conversation.save?.();

      try {
        const result = await callTool(toolName, userContext, params);

        await writeAuditLog({
          userId: userContext.id,
          conversationId: conversation.conversationId,
          userCommand: `CONFIRMED: ${toolName}`,
          language,
          detectedIntent: toolName,
          toolSelected: toolName,
          toolArguments: params,
          authorizationResult: { isAuthorized: true, userRole: userContext.role },
          executionResult: { success: true },
          status: 'SUCCESS'
        });

        return {
          conversationId: conversation.conversationId,
          intent: toolName,
          toolCalled: toolName,
          toolResult: result,
          response: language === 'ta'
            ? `✅ ${toolName} வெற்றிகரமாக நிறைவேற்றப்பட்டது.`
            : `✅ "${toolName}" completed successfully.`,
          requiresConfirmation: false
        };
      } catch (err) {
        await writeAuditLog({
          userId: userContext.id,
          conversationId: conversation.conversationId,
          userCommand: `CONFIRMED: ${toolName}`,
          language,
          detectedIntent: toolName,
          toolSelected: toolName,
          toolArguments: params,
          authorizationResult: { isAuthorized: true, userRole: userContext.role },
          executionResult: null,
          status: 'FAILED',
          errorInfo: err.message
        });
        throw err;
      }
    } else {
      // User cancelled the pending confirmation
      conversation.pendingConfirmation = { requiresConfirmation: false };
      await conversation.save?.();
      return {
        conversationId: conversation.conversationId,
        intent: 'CONFIRMATION_CANCELLED',
        response: language === 'ta'
          ? 'சரி, ரத்து செய்யப்பட்டது. வேறு என்ன உதவி வேண்டும்?'
          : 'Okay, cancelled. What else can I help you with?',
        requiresConfirmation: false
      };
    }
  }

  // ── Gemini Function-Calling ─────────────────────────────────────────────
  const ai = new GoogleGenAI({ apiKey: env.ai.apiKey });

  // Build conversation history for multi-turn context
  const history = (conversation.messages || []).slice(-12).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const functionDeclarations = buildGeminiFunctionDeclarations();
  const systemInstruction = buildUzhavanSystemInstruction(userContext);

  let geminiResponse;
  try {
    const chat = ai.chats.create({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction,
        tools: [{ functionDeclarations }],
        temperature: 0.3
      },
      history
    });

    geminiResponse = await chat.sendMessage(text);
  } catch (geminiErr) {
    console.error('[UZHAVAN GEMINI] API call failed:', geminiErr.message);

    await writeAuditLog({
      userId: userContext.id,
      conversationId: conversation.conversationId,
      userCommand: text,
      language,
      detectedIntent: 'GEMINI_ERROR',
      toolSelected: null,
      toolArguments: {},
      authorizationResult: { isAuthorized: true, userRole: userContext.role },
      executionResult: null,
      status: 'FAILED',
      errorInfo: geminiErr.message
    });

    return {
      conversationId: conversation.conversationId,
      intent: 'GEMINI_ERROR',
      response: language === 'ta'
        ? 'உழவன் AI இப்போது கிடைக்கவில்லை. தயவுசெய்து சிறிது நேரம் கழித்து முயற்சிக்கவும்.'
        : 'Uzhavan AI is temporarily unavailable. Please try again in a moment.',
      requiresConfirmation: false,
      error: geminiErr.message
    };
  }

  // Save user message to conversation
  conversation.messages.push({
    role: 'user',
    content: text,
    timestamp: new Date()
  });

  // Extract function calls or plain text response from Gemini
  const candidate = geminiResponse.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  const functionCallPart = parts.find((p) => p.functionCall);
  const textPart = parts.find((p) => p.text);

  // ── Gemini chose to call a tool ─────────────────────────────────────────
  if (functionCallPart) {
    const { name: toolName, args: toolArgs } = functionCallPart.functionCall;

    // DESTRUCTIVE TOOLS: require confirmation
    if (CONFIRMATION_REQUIRED_TOOLS.has(toolName)) {
      const confirmationPrompt = buildConfirmationPrompt(toolName, toolArgs, language);

      // Store pending confirmation in conversation
      conversation.pendingConfirmation = {
        requiresConfirmation: true,
        toolName,
        params: toolArgs,
        confirmationPrompt,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5-minute window
      };

      conversation.messages.push({
        role: 'assistant',
        content: confirmationPrompt,
        timestamp: new Date()
      });
      await conversation.save?.();

      await writeAuditLog({
        userId: userContext.id,
        conversationId: conversation.conversationId,
        userCommand: text,
        language,
        detectedIntent: toolName,
        toolSelected: toolName,
        toolArguments: toolArgs,
        authorizationResult: { isAuthorized: true, userRole: userContext.role },
        executionResult: null,
        status: 'CONFIRMATION_PENDING'
      });

      return {
        conversationId: conversation.conversationId,
        intent: toolName,
        toolCalled: null,
        response: confirmationPrompt,
        requiresConfirmation: true,
        toolName,
        params: toolArgs
      };
    }

    // NON-DESTRUCTIVE TOOLS: execute immediately
    let toolResult;
    let auditStatus = 'SUCCESS';
    let errorInfo = null;

    try {
      toolResult = await callTool(toolName, userContext, toolArgs);
    } catch (toolErr) {
      auditStatus = toolErr.statusCode === 403 ? 'UNAUTHORIZED' : 'FAILED';
      errorInfo = toolErr.message;

      await writeAuditLog({
        userId: userContext.id,
        conversationId: conversation.conversationId,
        userCommand: text,
        language,
        detectedIntent: toolName,
        toolSelected: toolName,
        toolArguments: toolArgs,
        authorizationResult: { isAuthorized: toolErr.statusCode !== 403, userRole: userContext.role },
        executionResult: null,
        status: auditStatus,
        errorInfo
      });

      // Generate friendly error response
      const errResponse = language === 'ta'
        ? `மன்னிக்கவும், "${toolName}" செயல்படுத்த முடியவில்லை: ${toolErr.message}`
        : `Sorry, couldn't execute "${toolName}": ${toolErr.message}`;

      conversation.messages.push({ role: 'assistant', content: errResponse, timestamp: new Date() });
      await conversation.save?.();

      return {
        conversationId: conversation.conversationId,
        intent: toolName,
        toolCalled: toolName,
        response: errResponse,
        requiresConfirmation: false,
        error: toolErr.message
      };
    }

    // Build assistant response text
    const successMsg = buildToolSuccessMessage(toolName, toolResult, language);

    conversation.messages.push({
      role: 'assistant',
      content: successMsg,
      toolCalls: [{ name: toolName, args: toolArgs }],
      toolResult,
      timestamp: new Date()
    });
    conversation.contextData.lastActiveTool = toolName;
    await conversation.save?.();

    await writeAuditLog({
      userId: userContext.id,
      conversationId: conversation.conversationId,
      userCommand: text,
      language,
      detectedIntent: toolName,
      toolSelected: toolName,
      toolArguments: toolArgs,
      authorizationResult: { isAuthorized: true, userRole: userContext.role },
      executionResult: { success: true, resultSummary: typeof toolResult === 'object' ? 'OK' : toolResult },
      status: auditStatus
    });

    return {
      conversationId: conversation.conversationId,
      intent: toolName,
      toolCalled: toolName,
      toolResult,
      response: successMsg,
      requiresConfirmation: false
    };
  }

  // ── Gemini returned a plain text response (clarification or conversation) ──
  const assistantText = textPart?.text || (language === 'ta'
    ? 'மன்னிக்கவும், நான் புரிந்துகொள்ளவில்லை. மீண்டும் கூறுங்கள்.'
    : 'Sorry, I didn\'t understand. Please rephrase.');

  conversation.messages.push({
    role: 'assistant',
    content: assistantText,
    timestamp: new Date()
  });
  await conversation.save?.();

  await writeAuditLog({
    userId: userContext.id,
    conversationId: conversation.conversationId,
    userCommand: text,
    language,
    detectedIntent: 'CLARIFICATION',
    toolSelected: null,
    toolArguments: {},
    authorizationResult: { isAuthorized: true, userRole: userContext.role },
    executionResult: { response: assistantText },
    status: 'SUCCESS'
  });

  return {
    conversationId: conversation.conversationId,
    intent: 'CLARIFICATION',
    toolCalled: null,
    response: assistantText,
    requiresConfirmation: false
  };
}

/**
 * Direct tool dispatch — used when the frontend knows the specific tool and args.
 */
export async function dispatchTool({ toolName, userContext, params, confirmationGiven = false }) {
  if (CONFIRMATION_REQUIRED_TOOLS.has(toolName) && !confirmationGiven) {
    return {
      requiresConfirmation: true,
      toolName,
      params,
      confirmationPrompt: buildConfirmationPrompt(toolName, params, 'en')
    };
  }

  const result = await callTool(toolName, userContext, params);

  await writeAuditLog({
    userId: userContext.id,
    conversationId: 'direct-dispatch',
    userCommand: `DIRECT_DISPATCH:${toolName}`,
    language: 'en',
    detectedIntent: toolName,
    toolSelected: toolName,
    toolArguments: params,
    authorizationResult: { isAuthorized: true, userRole: userContext.role },
    executionResult: { success: true },
    status: 'SUCCESS'
  });

  return { requiresConfirmation: false, toolName, result };
}

/**
 * Build a human-readable confirmation prompt for destructive actions.
 */
function buildConfirmationPrompt(toolName, params, language = 'en') {
  const prompts = {
    deleteProduct: language === 'ta'
      ? 'இந்த விளைபொருள் பட்டியலை நிரந்தரமாக நீக்க விரும்புகிறீர்களா? (ஆம் / இல்லை)'
      : 'Are you sure you want to permanently remove this produce listing? (Yes / No)',
    completeOrder: params?.fulfilledQuantity
      ? `Confirm: Mark this order as completed with ${params.fulfilledQuantity} delivered? (Yes / No)`
      : 'Confirm: Mark this order as fully completed? (Yes / No)',
    markNoShow: language === 'ta'
      ? 'வாங்குபவர் வரவில்லை என்று குறிக்க விரும்புகிறீர்களா? ஒதுக்கப்பட்ட இருப்பு திரும்ப வரும். (ஆம் / இல்லை)'
      : 'Confirm: Mark buyer as No-Show? Reserved stock will return to available inventory. (Yes / No)',
    recordOffPlatformSale: `Confirm: Record an external sale of ${params?.quantity || '?'} units from your stock? (Yes / No)`,
    cancelRequest: 'Confirm: Cancel this purchase request? (Yes / No)'
  };
  return prompts[toolName] || `Confirm: Execute "${toolName}"? (Yes / No)`;
}

/**
 * Build a friendly success message after tool execution.
 */
function buildToolSuccessMessage(toolName, result, language = 'en') {
  if (language === 'ta') {
    const tamilMessages = {
      createProduct: '✅ விளைபொருள் பட்டியல் வெற்றிகரமாக சேர்க்கப்பட்டது!',
      updateProduct: '✅ விளைபொருள் புதுப்பிக்கப்பட்டது.',
      addHarvest: '✅ அறுவடை சேர்க்கப்பட்டது.',
      submitRequest: '✅ கோரிக்கை அனுப்பப்பட்டது. உழவர் பதில் அனுப்பும்வரை காத்திருக்கவும்.',
      acceptRequest: '✅ கோரிக்கை ஏற்றுக்கொள்ளப்பட்டது.',
      searchProducts: `✅ ${Array.isArray(result?.items) ? result.items.length : 0} விளைபொருட்கள் கிடைத்தன.`,
      getMyProducts: `✅ உங்கள் ${Array.isArray(result) ? result.length : 0} பட்டியல்கள் கண்டுபிடிக்கப்பட்டன.`
    };
    return tamilMessages[toolName] || '✅ செயல் வெற்றிகரமாக நிறைவேற்றப்பட்டது.';
  }

  const englishMessages = {
    createProduct: `✅ Produce listing created successfully!`,
    updateProduct: '✅ Product updated.',
    addHarvest: '✅ Harvest stock added to your inventory.',
    submitRequest: '✅ Purchase request sent to the farmer. You\'ll be notified when they respond.',
    acceptRequest: '✅ Request accepted. The buyer will confirm quantity.',
    rejectRequest: '✅ Request rejected.',
    getDemandSignals: '✅ Here are the market demand signals:',
    sellMyHarvestMatch: '✅ Here are your best demand-matching opportunities:',
    searchProducts: `✅ Found ${Array.isArray(result?.items) ? result.items.length : 0} produce listings near you.`,
    getMyProducts: `✅ You have ${Array.isArray(result) ? result.length : 0} active listings.`,
    listByproduct: '✅ Byproduct listed on marketplace.'
  };

  return englishMessages[toolName] || `✅ "${toolName}" completed successfully.`;
}

export { getToolRegistry };
