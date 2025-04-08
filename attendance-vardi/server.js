const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

// אתחול אפליקציית Express
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// שירות קבצים סטטיים מ-build של React
app.use(express.static(path.join(__dirname, 'client/build')));

// Middleware לטיפול בקבצים
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// הגדרת תיקיית העלאת קבצים
const upload = multer({ 
  dest: path.join(__dirname, 'uploads/'),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// מודלים למסד הנתונים
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

const Course = mongoose.model('Course', courseSchema);
const Student = mongoose.model('Student', studentSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

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

// נקודת קצה להעלאת נתונים מ-CSV
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Received file upload request');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    if (!req.file) {
      console.log('No file received');
      return res.status(400).json({ error: 'לא נבחר קובץ' });
    }

    const filePath = req.file.path;
    console.log('File saved at:', filePath);
    
    const courses = new Set();
    const students = [];
    const courseMap = new Map();

    console.log('Starting to process CSV file...');
    
    // קריאת קובץ הנתונים
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({
          separator: ',',
          mapHeaders: ({ header }) => header.trim()
        }))
        .on('data', (data) => {
          console.log('Processing row:', data);
          
          // בדיקה שהשדות הנדרשים קיימים
          if (!data['מספר תלמיד'] || !data['שם משפחה'] || !data['שם פרטי']) {
            console.error('Missing required fields:', data);
            return;
          }

          // הוספת קורסים למפה
          if (data['קורס רצועה ראשונה']) {
            courses.add(data['קורס רצועה ראשונה']);
          }
          if (data['קורס רצועה שנייה']) {
            courses.add(data['קורס רצועה שנייה']);
          }

          // הוספת תלמיד
          const studentId = parseInt(data['מספר תלמיד']);
          if (isNaN(studentId)) {
            console.error('Invalid student ID:', data['מספר תלמיד']);
            return;
          }

          students.push({
            id: studentId,
            name: `${data['שם פרטי']} ${data['שם משפחה']}`,
            morningCourse: data['קורס רצועה ראשונה'],
            afternoonCourse: data['קורס רצועה שנייה']
          });
        })
        .on('end', () => {
          console.log('Finished processing CSV file');
          console.log('Found courses:', Array.from(courses));
          console.log('Found students:', students.length);
          resolve();
        })
        .on('error', (error) => {
          console.error('Error processing CSV:', error);
          reject(error);
        });
    });

    if (students.length === 0) {
      throw new Error('לא נמצאו תלמידים בקובץ');
    }

    if (courses.size === 0) {
      throw new Error('לא נמצאו קורסים בקובץ');
    }

    // מחיקת הקובץ הזמני
    await fs.promises.unlink(filePath);
    console.log('Temporary file deleted');

    // יצירת מיפוי קורסים למספרים
    let courseNumber = 1;
    for (const courseName of courses) {
      courseMap.set(courseName, courseNumber++);
    }

    console.log('Course mapping:', Object.fromEntries(courseMap));

    // המרת שמות קורסים למספרים
    const processedStudents = students.map(student => ({
      id: student.id,
      name: student.name,
      morningCourse: courseMap.get(student.morningCourse),
      afternoonCourse: courseMap.get(student.afternoonCourse)
    }));

    // יצירת מיפוי קורסים למספרים עם רצועות נכונות
    const morningCourses = new Set();
    const afternoonCourses = new Set();
    
    // מיון קורסים לרצועות
    students.forEach(student => {
      if (student.morningCourse) {
        morningCourses.add(student.morningCourse);
      }
      if (student.afternoonCourse) {
        afternoonCourses.add(student.afternoonCourse);
      }
    });

    const processedCourses = [
      // קורסי רצועה ראשונה
      ...Array.from(morningCourses).map(courseName => ({
        id: courseMap.get(courseName),
        name: courseName,
        timeSlot: 1
      })),
      // קורסי רצועה שנייה
      ...Array.from(afternoonCourses).map(courseName => ({
        id: courseMap.get(courseName),
        name: courseName,
        timeSlot: 2
      }))
    ];

    console.log('Processed courses:', processedCourses);
    console.log('Processed students:', processedStudents);

    // מחיקת נתונים קיימים
    console.log('Deleting existing data...');
    await Course.deleteMany({});
    await Student.deleteMany({});

    // הוספת נתונים חדשים
    console.log('Inserting new data...');
    await Course.insertMany(processedCourses);
    await Student.insertMany(processedStudents);
    console.log('Data inserted successfully');

    res.json({ 
      success: true, 
      message: 'הנתונים הועלו בהצלחה',
      courses: processedCourses,
      students: processedStudents
    });
  } catch (error) {
    console.error('שגיאה בהעלאת נתונים:', error);
    res.status(500).json({ success: false, message: error.message });
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

// חיבור למסד הנתונים והפעלת השרת
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/attendance')
  .then(() => {
    console.log('Connected to MongoDB');
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  }); 