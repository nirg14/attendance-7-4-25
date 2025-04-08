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

// נתיב אתחול משתמש ראשוני
app.post('/api/init/user', async (req, res) => {
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

// נקודת קצה להעלאת נתונים מ-CSV
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('התקבלה בקשה להעלאת קובץ');
    console.log('גוף הבקשה:', req.body);
    console.log('קובץ:', req.file);

    if (!req.file) {
      console.log('לא התקבל קובץ');
      return res.status(400).json({ error: 'לא נבחר קובץ' });
    }

    const filePath = req.file.path;
    console.log('הקובץ נשמר בנתיב:', filePath);
    
    const courses = new Set();
    const students = [];
    const courseMap = new Map();

    console.log('מתחיל לעבד את קובץ ה-CSV...');
    
    // קריאת קובץ הנתונים
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({
          separator: ',',
          mapHeaders: ({ header }) => header.trim()
        }))
        .on('headers', (headers) => {
          console.log('כותרות הקובץ:', headers);
        })
        .on('data', (data) => {
          console.log('נתוני שורה גולמיים:', data);
          
          // בדיקת תקינות השדות הנדרשים
          const studentId = parseInt(data['מספר תלמיד']);
          const firstName = data['שם פרטי']?.trim();
          const lastName = data['שם משפחה']?.trim();
          const morningCourse = data['קורס רצועה ראשונה']?.trim();
          const afternoonCourse = data['קורס רצועה שנייה']?.trim();

          console.log('נתונים מעובדים:', {
            studentId,
            firstName,
            lastName,
            morningCourse,
            afternoonCourse
          });

          if (!studentId || isNaN(studentId)) {
            console.error('מספר תלמיד לא תקין:', data['מספר תלמיד']);
            return;
          }

          if (!firstName || !lastName) {
            console.error('שם תלמיד חסר:', studentId);
            return;
          }

          if (!morningCourse || !afternoonCourse) {
            console.error('קורסים חסרים עבור תלמיד:', studentId);
            return;
          }

          // הוספת קורסים למפה
          courses.add(morningCourse);
          courses.add(afternoonCourse);

          // הוספת תלמיד
          students.push({
            id: studentId,
            name: `${firstName} ${lastName}`,
            morningCourse,
            afternoonCourse
          });
        })
        .on('end', () => {
          console.log('סיום עיבוד קובץ CSV');
          console.log('קורסים שנמצאו:', Array.from(courses));
          console.log('תלמידים שנמצאו:', students.length);
          resolve();
        })
        .on('error', (error) => {
          console.error('שגיאה בעיבוד CSV:', error);
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
    console.log('הקובץ הזמני נמחק');

    // יצירת מיפוי קורסים למספרים
    let courseNumber = 1;
    for (const courseName of courses) {
      courseMap.set(courseName, courseNumber++);
    }

    console.log('מיפוי קורסים:', Object.fromEntries(courseMap));

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

    console.log('קורסים מעובדים:', processedCourses);
    console.log('תלמידים מעובדים:', processedStudents);

    // מחיקת נתונים קיימים
    console.log('מוחק נתונים קיימים...');
    await Course.deleteMany({});
    await Student.deleteMany({});

    // הוספת נתונים חדשים
    console.log('מכניס נתונים חדשים...');
    await Course.insertMany(processedCourses);
    await Student.insertMany(processedStudents);
    console.log('הנתונים הוכנסו בהצלחה');

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

// נתיב ברירת מחדל - מחזיר את אפליקציית React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// התחברות למסד נתונים והפעלת השרת
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/attendance';

mongoose.connect(MONGODB_URI, { 
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
})
.catch(err => console.error('Could not connect to MongoDB', err));