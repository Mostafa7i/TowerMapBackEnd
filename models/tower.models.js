const mongoose = require("mongoose");

const TowerSchema = new mongoose.Schema({
    TowerName: {
        type: String,
        required: true
    },
    ip_address: {
        type: String,
        required: true,
        unique: true
    },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    vendor: {
        type: String,
        enum: ['Huawei', 'Cisco', 'Nokia', 'ZTE' , 'Samsung'],
        default: 'Cisco'
    },
    status: {
        type: String,
        enum: ['normal', "warning", 'critcal', 'Safe', 'Danger'], 
        default: "normal"
    },
    lastMeasurement: {
        latency: Number,
        packetLoss: Number,
        jitter: Number,
        throughput: Number
    },
    lastCheck: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Tower", TowerSchema);