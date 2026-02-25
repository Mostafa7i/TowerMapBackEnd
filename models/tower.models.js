const mongoose  = require("mongoose")


const TowerSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    ip_address : {
        type : String,
        required : true,
        unique : true
    },
    location : {
        lat : {type : Number , required : true},
        lng : {type : Number , required : true}
    },

    vendor :{
        type : String,
        enum : ['Huawei' , 'Cisco' , 'Nokia' , 'ZTE'],
        default : 'Cisco'
    },
    status :{
        type : String,
        enum : ['normal' , "warning" , 'critcal'],
        default : "normal"
    }
} , {timestamps : true})

module.exports = mongoose.model("Tower" , TowerSchema)