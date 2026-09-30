import * as authService from './auth.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    return sendSuccess(res, result, 'Registration successful', 201);
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, 'Login successful', 200);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await authService.getProfile(req.user.id);
    return sendSuccess(res, { user }, 'User profile retrieved', 200);
  } catch (error) {
    next(error);
  }
}
