const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// אתחול אפליקציית Express
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// שירות קבצים סטטיים מ-build של React
app.use(express.static(path.join(__dirname, 'client/build')));

// מודלים למסד הנתונים
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const courseSchema = new mongoose.Schema({
  id: Number,
  name: String,
  timeSlot: Number,
});

const studentSchema = new mongoose.Schema({
  id: Number,
  name: String,
  morningCourse: Number,
  afternoonCourse: Number
});

const attendanceSchema = new mongoose.Schema({
  date: String,
  studentId: Number,
  courseId: Number,
  present: Boolean
});

const User = mongoose.model('User', userSchema);
const Course = mongoose.model('Course', courseSchema);
const Student = mongoose.model('Student', studentSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

// נתיבי התחברות
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// נתיבי API

// קבלת כל הקורסים
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await Course.find();
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// קבלת כל התלמידים
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// קבלת נתוני נוכחות לפי תאריך
app.get('/api/attendance/:date', async (req, res) => {
  try {
    const attendance = await Attendance.find({ date: req.params.date });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// הוספה או עדכון נוכחות
app.post('/api/attendance', async (req, res) => {
  const { date, studentId, courseId, present } = req.body;
  
  try {
    // בדיקה אם כבר קיים רשומה
    const existingRecord = await Attendance.findOne({ 
      date, 
      studentId, 
      courseId 
    });
    
    if (existingRecord) {
      // עדכון רשומה קיימת
      existingRecord.present = present;
      await existingRecord.save();
      res.json(existingRecord);
    } else {
      // יצירת רשומה חדשה
      const newAttendance = new Attendance({
        date,
        studentId,
        courseId,
        present
      });
      
      const savedAttendance = await newAttendance.save();
      res.status(201).json(savedAttendance);
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// נתיבים לאתחול נתונים

// הוספת קורסים
app.post('/api/init/courses', async (req, res) => {
  try {
    await Course.deleteMany({});
    const courses = await Course.insertMany([
      { id: 1, name: 'מתמטיקה מתקדמת', timeSlot: 1 },
      { id: 2, name: 'פיזיקה קוונטית', timeSlot: 1 },
      { id: 3, name: 'תכנות ואלגוריתמים', timeSlot: 1 },
      { id: 4, name: 'ביולוגיה מולקולרית', timeSlot: 2 },
      { id: 5, name: 'אמנות ויצירה', timeSlot: 2 },
      { id: 6, name: 'מוזיקה ותיאוריה', timeSlot: 2 }
    ]);
    res.status(201).json(courses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// הוספת תלמידים
app.post('/api/init/students', async (req, res) => {
  try {
    await Student.deleteMany({});
    const students = await Student.insertMany([
      { id: 1, name: 'איתי כהן', morningCourse: 1, afternoonCourse: 4 },
      { id: 2, name: 'מיכל לוי', morningCourse: 1, afternoonCourse: 5 },
      { id: 3, name: 'יונתן גולן', morningCourse: 2, afternoonCourse: 4 },
      { id: 4, name: 'שירה אברהמי', morningCourse: 2, afternoonCourse: 6 },
      { id: 5, name: 'דניאל רוזן', morningCourse: 3, afternoonCourse: 5 },
      { id: 6, name: 'נועה פרץ', morningCourse: 3, afternoonCourse: 6 }
    ]);
    res.status(201).json(students);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// נתיב ליצירת משתמש ראשוני
app.post('/api/init-user', async (req, res) => {
  try {
    // בדיקה אם כבר קיים משתמש
    const existingUser = await User.findOne();
    if (existingUser) {
      return res.status(400).json({ message: 'משתמש כבר קיים במערכת' });
    }

    // יצירת משתמש ראשוני
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const user = new User({
      username: 'admin',
      password: hashedPassword
    });

    await user.save();
    res.json({ message: 'משתמש ראשוני נוצר בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// טיפול בבקשות שלא נמצאו - מפנה ל-React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// התחברות למסד נתונים והפעלת השרת
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://username:password@cluster0.mongodb.net/attendance?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI, { 
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
})
.catch(err => console.error('Could not connect to MongoDB', err));