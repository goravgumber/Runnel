const User = require("../models/User");

class UserRepository {
  async findByIdentifier(identifier) {
    if (!identifier) return null;
    const trimmed = String(identifier).trim();
    const lower = trimmed.toLowerCase();
    return User.findOne({
      $or: [
        { username: lower },
        { username: trimmed },
        { email: lower },
        { email: trimmed },
      ],
    }).select("+password");
  }

  async findByUsername(username) {
    return this.findByIdentifier(username);
  }

  async findById(id) {
    return User.findById(id);
  }

  async list({ limit = 50, skip = 0 } = {}) {
    return User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count() {
    return User.countDocuments();
  }

  async createUser(userData) {
    const user = new User(userData);
    return user.save();
  }

  async updateById(id, update) {
    return User.findByIdAndUpdate(id, update, { new: true }).select("-password");
  }
}

module.exports = new UserRepository();
