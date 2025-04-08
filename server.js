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
    const courses = await Course.find().sort({ timeSlot: 1, name: 1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// קבלת קורסי רצועה ראשונה
app.get('/api/courses/slot1', async (req, res) => {
  try {
    const courses = await Course.find({ timeSlot: 1 }).sort({ name: 1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// קבלת קורסי רצועה שנייה
app.get('/api/courses/slot2', async (req, res) => {
  try {
    const courses = await Course.find({ timeSlot: 2 }).sort({ name: 1 });
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
    
    // הגדרת רשימות הקורסים המדויקות
    const slot1Courses = [
      'איך בונים את זה?',
      'ביטים חרוזים חיים',
      'בינה מלאכותית',
      'ביצוע יצירה והפקה',
      'דיבייט',
      'כתיבת מדע בדיוני',
      'לחשוב בחמישה מימדים',
      'מייקרים',
      'משחק החיים',
      'סטודיו פתוח',
      'תורת המשחקים כלכלה',
      'תקשורת חזותית',
      'rescue',
      'time',
      '*לא ידוע1*'
    ];

    const slot2Courses = [
      'רכבת ההיפ הופ',
      'על קצה המזלג',
      'חוויה פיננסית',
      'עיצוב דיגיטלי',
      'משחקי תפקידים',
      'יומן ויזואלי',
      'ביצוע יצירה והפקה',
      'דיבייט',
      'הכר את האויב',
      'החממה להנדסת צעצועים',
      '*לא ידוע2*'
    ];

    // מחיקת כל הקורסים הקיימים
    console.log('מוחק את כל הקורסים הקיימים...');
    await Course.deleteMany({});

    // יצירת מיפוי קורסים למספרים
    const courseMap = new Map();
    let courseNumber = 1;
    
    // יצירת מיפוי קורסים למספרים
    [...slot1Courses, ...slot2Courses].forEach(courseName => {
      if (!courseMap.has(courseName)) {
        courseMap.set(courseName, courseNumber++);
      }
    });

    // הכנסת הקורסים מחדש עם הרצועות הנכונות
    const coursesToInsert = [
      // קורסי רצועה ראשונה
      ...slot1Courses.map(courseName => ({
        id: courseMap.get(courseName),
        name: courseName,
        timeSlot: 1
      })),
      // קורסי רצועה שנייה
      ...slot2Courses.map(courseName => ({
        id: courseMap.get(courseName),
        name: courseName,
        timeSlot: 2
      }))
    ];

    console.log('מכניס את הקורסים מחדש...');
    await Course.insertMany(coursesToInsert);
    console.log('הקורסים הוכנסו בהצלחה');

    const students = [];

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

          // וידוא שהקורסים קיימים ברשימות המתאימות
          if (!slot1Courses.includes(morningCourse)) {
            console.error('קורס רצועה ראשונה לא תקין:', morningCourse);
            return;
          }

          if (!slot2Courses.includes(afternoonCourse)) {
            console.error('קורס רצועה שנייה לא תקין:', afternoonCourse);
            return;
          }

          students.push({
            id: studentId,
            name: `${firstName} ${lastName}`,
            morningCourse: courseMap.get(morningCourse),
            afternoonCourse: courseMap.get(afternoonCourse)
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (students.length === 0) {
      throw new Error('לא נמצאו תלמידים בקובץ');
    }

    // מחיקת הקובץ הזמני
    await fs.promises.unlink(filePath);
    console.log('הקובץ הזמני נמחק');

    // מחיקת רשימת התלמידים הקיימת והכנסת הרשימה החדשה
    console.log('מעדכן את רשימת התלמידים...');
    await Student.deleteMany({});
    await Student.insertMany(students);
    console.log('רשימת התלמידים עודכנה בהצלחה');

    res.json({ 
      success: true, 
      message: 'הנתונים הועלו בהצלחה',
      students
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