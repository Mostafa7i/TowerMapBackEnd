const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    trim: true,
    required: true,
    unique: true,
    toLowerCase : true
  },
  phone :{
    type : String,
    required : true,
  },
  password: {
    type: String,
    trim: true,
    required: true,
  },


  section : String,
  isAdmin :{
    type : Boolean,
    default : false
  },
  isVerified : {
    type : Boolean,
    default : false
  },
  verificationStatus : {
    type : String,
    enum : ["pending", "approved", "rejected"],
    default : "pending"
  },

} , {timestamps : true});

const User = mongoose.model("User" , userSchema)

module.exports = User
