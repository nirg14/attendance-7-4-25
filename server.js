const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

// יצירת תיקיית העלאות אם היא לא קיימת
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// התחברות למונגו
mongoose.connect('mongodb+srv://attendance-vardi:vardi2025@cluster0.mvjnk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('התחברות למסד הנתונים הצליחה');
}).catch((error) => {
  console.error('שגיאה בהתחברות למסד הנתונים:', error);
});

// הגדרת מודלים
const Course = mongoose.model('Course', {
  id: { type: Number, unique: true, required: true },
  name: String,
  timeSlot: Number
});

const Student = mongoose.model('Student', {
  studentId: { type: String, unique: true, required: true },
  firstName: String,
  lastName: String,
  morningCourseId: Number,
  afternoonCourseId: Number
});

const Attendance = mongoose.model('Attendance', {
  studentId: Number,
  courseId: Number,
  date: String,
  status: String
});

// הגדרת multer לטיפול בהעלאת קבצים
const upload = multer({ dest: uploadsDir });

// הגדרת רשימות הקורסים לכל רצועה
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

// קבלת רשימת הקורסים לפי רצועה
app.get('/api/courses/slot1', async (req, res) => {
  try {
    const courses = await Course.find({ timeSlot: 1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/courses/slot2', async (req, res) => {
  try {
    const courses = await Course.find({ timeSlot: 2 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת רשימת התלמידים
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת נתוני נוכחות לתאריך מסוים
app.get('/api/attendance/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const attendance = await Attendance.find({ date });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון נוכחות
app.post('/api/attendance', express.json(), async (req, res) => {
  try {
    const { studentId, courseId, date, present } = req.body;
    
    await Attendance.findOneAndUpdate(
      { studentId, courseId, date },
      { status: present ? 'present' : 'absent' },
      { upsert: true }
    );
    
    res.json({ message: 'Attendance updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// טיפול בהעלאת קובץ CSV
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'לא נבחר קובץ' });
  }

  try {
    // בדיקה אם יש קורסים במערכת
    const existingCourses = await Course.find();

    // אם אין קורסים, נכניס את הרשימה המלאה
    if (existingCourses.length === 0) {
      // יצירת מיפוי קורסים למספרים
      const courseMap = new Map();
      let courseNumber = 1;
      
      // יצירת מיפוי קורסים למספרים
      [...slot1Courses, ...slot2Courses].forEach(courseName => {
        // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
        const isInBothSlots = slot1Courses.includes(courseName) && slot2Courses.includes(courseName);
        const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
        if (!courseMap.has(courseKey)) {
          courseMap.set(courseKey, courseNumber++);
        }
      });

      // הכנסת הקורסים מחדש עם הרצועות הנכונות
      // קורסי רצועה ראשונה
      for (const courseName of slot1Courses) {
        const isInBothSlots = slot2Courses.includes(courseName);
        const courseKey = isInBothSlots ? `${courseName}_1` : courseName;
        await Course.create({
          id: courseMap.get(courseKey),
          name: courseName,
          timeSlot: 1
        });
      }
      
      // קורסי רצועה שנייה
      for (const courseName of slot2Courses) {
        const isInBothSlots = slot1Courses.includes(courseName);
        const courseKey = isInBothSlots ? `${courseName}_2` : courseName;
        await Course.create({
          id: courseMap.get(courseKey),
          name: courseName,
          timeSlot: 2
        });
      }
    }

    // קריאת הקובץ שהועלה
    const students = [];
    const courses = new Set();
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv({ trim: true }))
        .on('data', (data) => {
          // בדיקת תקינות הנתונים
          if (!data['מספר תלמיד'] || !data['שם פרטי'] || !data['שם משפחה'] || 
              !data['קורס רצועה ראשונה'] || !data['קורס רצועה שנייה']) {
            reject(new Error('חסרים שדות חובה בקובץ'));
            return;
          }

          // ניקוי מספר התלמיד
          const studentId = data['מספר תלמיד'].toString().replace(/[^0-9]/g, '');
          
          // בדיקת תקינות הקורסים
          const morningCourse = data['קורס רצועה ראשונה'];
          const afternoonCourse = data['קורס רצועה שנייה'];
          
          if (!slot1Courses.includes(morningCourse)) {
            reject(new Error(`קורס לא תקין ברצועה ראשונה: ${morningCourse}`));
            return;
          }
          
          if (!slot2Courses.includes(afternoonCourse)) {
            reject(new Error(`קורס לא תקין ברצועה שנייה: ${afternoonCourse}`));
            return;
          }

          students.push({
            studentId,
            firstName: data['שם פרטי'],
            lastName: data['שם משפחה'],
            morningCourse,
            afternoonCourse
          });

          courses.add(morningCourse);
          courses.add(afternoonCourse);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // מחיקת התלמידים הקיימים
    await Student.deleteMany({});

    // הכנסת התלמידים החדשים
    for (const student of students) {
      // מציאת ה-ID של הקורסים
      const morningCourse = await Course.findOne({ name: student.morningCourse, timeSlot: 1 });
      const afternoonCourse = await Course.findOne({ name: student.afternoonCourse, timeSlot: 2 });

      await Student.create({
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        morningCourseId: morningCourse?.id,
        afternoonCourseId: afternoonCourse?.id
      });
    }

    // מחיקת הקובץ שהועלה
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: 'הקובץ הועלה בהצלחה',
      students: students.length,
      courses: courses.size
    });
  } catch (error) {
    console.error('שגיאה בעיבוד הקובץ:', error);
    res.status(500).json({ error: error.message });
  }
});

// קבלת רשימת הקורסים
app.get('/courses', async (req, res) => {
  try {
    const courses = await Course.find();
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת רשימת התלמידים
app.get('/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// שמירת נוכחות
app.post('/attendance', async (req, res) => {
  try {
    const { studentId, courseId, date, status } = req.body;
    const attendance = await Attendance.create({ studentId, courseId, date, status });
    res.json({ id: attendance._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת נוכחות
app.get('/attendance', async (req, res) => {
  try {
    const { date, courseId } = req.query;
    const attendance = await Attendance.find({ date, courseId });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// הפעלת השרת
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// הגדרת ראוט ברירת מחדל - חייב להיות אחרון
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
}); 