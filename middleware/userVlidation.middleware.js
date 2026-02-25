const { RegisterValidation, LoginValidation } = require("../services/userValidation.service");

exports.registerValid = (req, res, next) => {
  const { error } = RegisterValidation.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    return res.status(400).send({
      message: "Validation Filed!",
      details: error.details.map((e) => e.message),
    });
  }
  next();
};
exports.loginValid = (req, res, next) => {
  const { error } = LoginValidation.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    return res.status(400).send({
      message: "Validation Filed!",
      details: error.details.map((e) => e.message),
    });
  }
  next();
};
