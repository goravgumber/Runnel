const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/userRepository");
const AppError = require("../middleware/AppError");
const config = require("../config/env");
const {
  storeRefreshToken,
  isRefreshTokenActive,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  blacklistToken,
} = require("../utils/tokenBlacklist");

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const toPublicUser = (user) => ({
  id: user._id,
  username: user.username,
  role: user.role || "user",
  isAdmin: user.role === "admin",
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

class AuthService {
  createAccessToken(user) {
    return jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role || "user",
        isAdmin: user.role === "admin",
        tokenVersion: user.tokenVersion || 0,
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_ACCESS_EXPIRES_IN }
    );
  }

  async createRefreshToken(user) {
    const tokenId = crypto.randomUUID();
    const token = jwt.sign(
      {
        id: user._id,
        tokenId,
        tokenVersion: user.tokenVersion || 0,
        type: "refresh",
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN }
    );

    await storeRefreshToken(user._id.toString(), tokenId, REFRESH_TTL_SECONDS);
    return token;
  }

  async signup({ username, password }) {
    const normalizedUsername = (username || "").trim().toLowerCase();
    if (!normalizedUsername || normalizedUsername.length < 3) {
      throw new AppError("Username must be at least 3 characters long", 400);
    }
    if (!password || password.length < 8) {
      throw new AppError("Password must be at least 8 characters long", 400);
    }

    const existingUser = await userRepository.findByUsername(normalizedUsername);
    if (existingUser) {
      throw new AppError("Username already taken. Please choose another username or sign in.", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await userRepository.createUser({
      username: normalizedUsername,
      password: hashedPassword,
    });

    const accessToken = this.createAccessToken(user);
    const refreshToken = await this.createRefreshToken(user);

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      user: toPublicUser(user),
    };
  }

  async login({ username, password }) {
    const trimmedIdentifier = (username || "").trim();
    if (!trimmedIdentifier) {
      throw new AppError("Username or email is required", 400);
    }
    if (!password) {
      throw new AppError("Password is required", 400);
    }

    const user = await userRepository.findByUsername(trimmedIdentifier);
    if (!user) {
      const isEmail = trimmedIdentifier.includes("@");
      throw new AppError(
        isEmail
          ? "No account found with this email address. Please check your spelling or sign up."
          : "No account found with this username. Please check your spelling or sign up.",
        401
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError("Incorrect password. Please double-check your password and try again.", 401);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = this.createAccessToken(user);
    const refreshToken = await this.createRefreshToken(user);

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      user: toPublicUser(user),
    };
  }

  async refresh(refreshToken) {
    if (!refreshToken) {
      throw new AppError("Refresh token is required", 401);
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.JWT_SECRET);
    } catch (error) {
      throw new AppError("Invalid or expired refresh token", 401, [{ message: error.message }]);
    }

    if (decoded.type !== "refresh" || !decoded.tokenId) {
      throw new AppError("Invalid refresh token", 401);
    }

    const user = await userRepository.findById(decoded.id);
    if (!user || (user.tokenVersion || 0) !== decoded.tokenVersion) {
      throw new AppError("Refresh token has been revoked", 401);
    }

    const active = await isRefreshTokenActive(user._id.toString(), decoded.tokenId);
    if (!active) {
      await revokeAllRefreshTokens(user._id.toString());
      throw new AppError("Refresh token reuse detected", 401);
    }

    await revokeRefreshToken(user._id.toString(), decoded.tokenId);

    const accessToken = this.createAccessToken(user);
    const nextRefreshToken = await this.createRefreshToken(user);

    return {
      token: accessToken,
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      user: toPublicUser(user),
    };
  }

  async logout({ accessToken, refreshToken, userId }) {
    if (accessToken) {
      const decoded = jwt.decode(accessToken);
      const remainingTtlSeconds = decoded?.exp
        ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1)
        : 1;
      await blacklistToken(accessToken, remainingTtlSeconds);
    }

    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, config.JWT_SECRET);
        if (decoded.type === "refresh" && decoded.tokenId) {
          await revokeRefreshToken(decoded.id || userId, decoded.tokenId);
        }
      } catch (_error) {
        // Expired or malformed refresh tokens are already unusable.
      }
    }

    return { loggedOut: true };
  }

  async logoutAll(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await revokeAllRefreshTokens(user._id.toString());

    return { revoked: true };
  }

  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return toPublicUser(user);
  }
}

module.exports = new AuthService();
