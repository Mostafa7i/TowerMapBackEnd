const validtionSchema = require("../services/userValidationservice");
 exports.validUserFun = (req, res, next) => {
  const { error } = validtionSchema.validate(req.body, { abortEarly: false });

  if (error) {
    return res
      .status(400)
      .send({
        message: "validation Filed!",
        details: error.details.map((d) => d.message),
      });
  }

  next()
};


