const { validationResult } = require("express-validator");
const AppError = require("./AppError");

const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) {
      return next();
    }

    const errors = result.array();
    const firstMsg = errors[0]?.msg || "Validation failed";
    return next(
      new AppError(
        firstMsg,
        400,
        errors.map((error) => ({
          path: error.path,
          message: error.msg,
        }))
      )
    );
  },
];

module.exports = {
  validate,
};
