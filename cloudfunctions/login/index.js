'use strict';

const crypto = require('crypto');

/**
 * CloudBase 云函数 - 用户登录验证
 * 查询 system_users 集合，SHA-256 加盐验证密码
 * Event 类型，通过网关暴露为 POST /login
 */
exports.main = async (event, context) => {
  const { httpMethod, body: rawBody } = event;

  // CORS headers for browser requests
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-SDK-Version',
    'Access-Control-Max-Age': '86400',
  };

  // Handle preflight
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }),
    };
  }

  try {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody || {});
    const { username, password } = body;

    if (!username || !password) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'INVALID_INPUT', message: '请提供用户名和密码。' }),
      };
    }

    const normalizedUser = username.trim().toLowerCase();

    // 使用 @cloudbase/node-sdk 查询 system_users 集合
    const cloudbase = require('@cloudbase/node-sdk');
    const app = cloudbase.init({
      env: process.env.TCB_ENV_ID,
    });
    const db = app.database();

    const result = await db.collection('system_users')
      .where({ username: normalizedUser })
      .limit(1)
      .get();

    if (!result.data || result.data.length === 0) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'AUTH_FAILED', message: '用户名或密码错误。' }),
      };
    }

    const userDoc = result.data[0];
    const hash = crypto.createHash('sha256').update(userDoc.salt + password).digest('hex');

    if (hash !== userDoc.passwordHash) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'AUTH_FAILED', message: '用户名或密码错误。' }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SUCCESS',
        data: {
          uid: normalizedUser,
          username: normalizedUser,
          role: userDoc.role,
        },
      }),
    };
  } catch (error) {
    console.error('Login function error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SERVER_ERROR', message: '服务器内部错误，请稍后重试。' }),
    };
  }
};