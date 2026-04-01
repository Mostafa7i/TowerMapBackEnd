const joi = require("joi");

const validtionSchema = joi.object({
  fullName: joi.string().required().min(3),
  email: joi.string().required().email().trim().lowercase(),
  phone: joi.string().required().pattern(new RegExp("^01[0-9]{9}$")),
  password: joi.string().pattern(new RegExp("^[a-zA-Z0-9]{3,30}$")).required(),
  section : joi.string()
});


module.exports = validtionSchema