const joi = require("joi");

const RegisterValidation = joi.object({
  fullName: joi.string().required().min(3),
  email: joi.string().email().required(),
  phone: joi.string().required().pattern(new RegExp("^01[0-9]{9}$")),
  password: joi.string().pattern(new RegExp("^[a-zA-Z0-9]{3,30}$")).required(),
  confirmPassword: joi.ref("password"),
  section: joi.string(),
});
const LoginValidation = joi.object({
  email: joi.string().email().required(),
  password: joi.string().pattern(new RegExp("^[a-zA-Z0-9]{3,30}$")).required(),
});

module.exports = {
  RegisterValidation,
  LoginValidation
};
