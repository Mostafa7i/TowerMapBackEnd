const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const bcryptjs = require("bcryptjs");
const User = require('./models/user.models');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.CONNECTDB_URL || "mongodb://localhost:27017/towerMap");
    console.log("Connected to MongoDB.");

    const email = 'admin@gmail.com';
    const password = 'Aa123456';
    const fullName = 'System Admin';

    // Check if admin already exists
    let user = await User.findOne({ email });
    if (user) {
      console.log('Admin already exists.');
      // Optional: Update password just in case it doesn't match
      const salt = await bcryptjs.genSalt(10);
      user.password = await bcryptjs.hash(password, salt);
      user.isAdmin = true;
      user.isVerified = true;
      user.verificationStatus = 'approved';
      await user.save();
      console.log('Admin updated with new password.');
    } else {
      const salt = await bcryptjs.genSalt(10);
      const hashPass = await bcryptjs.hash(password, salt);

      user = new User({
        fullName,
        email,
        password: hashPass,
        phone: '01000000000',
        section: 'Admin',
        isAdmin: true,
        isVerified: true,
        verificationStatus: 'approved'
      });

      await user.save();
      console.log('Admin user created successfully.');
    }

    mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error('Error creating admin:', error);
    mongoose.disconnect();
  }
};

createAdmin();
