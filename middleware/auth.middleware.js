const jwt = require("jsonwebtoken");
const User = require("../models/user.models");



const AuthProduct = async(req , res , next) =>{
    let token ; 
    
    if(req.cookies && req.cookies.access_token){
        token = req.cookies.access_token;
    }else if(req.headers.authorization?.startsWith("Bearer")){
        token = req.headers.authorization.split(" ")[1]
    };

    if(!token){
        return res.status(401).json({message : "غير مصرح لك بالوصل!"})
    }

    try {
        const decode = jwt.verify(token , process.env.JWT_SECRET)
        const user = await User.findById(decode.id).select("-password")

        if(!user){
            return res.status(401).json({message : "المستخدم غير موجود"})
        }

        req.user = {
            id : user._id,
            role : user.role,
            fullName : user.fullName,
            email : user.email
        }

        next()
    } catch (error) {
        console.log(error)
        return res.status(401).json({message : "التوكين غير صالح"})
    }

}

module.exports = AuthProduct