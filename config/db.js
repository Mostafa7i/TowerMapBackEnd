const mongoose = require("mongoose")


const connectDB = async() =>{
    try {
        await mongoose.connect(process.env.CONNECTDB_URL)
        console.log(`the database is connected Sccessfully🟢🟢🟢`)
    } catch (error) {
        console.error(`Erorr in connection DB >> ${error}`)
        process.exit(1)
    }
}
module.exports = connectDB