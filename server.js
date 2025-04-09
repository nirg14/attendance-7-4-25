const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const cors = require('cors');
require('dotenv').config();

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
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('התחברות למסד הנתונים הצליחה');
}).catch((error) => {
  console.error('שגיאה בהתחברות למסד הנתונים:', error);
});

// הגדרת מודלים
const Course = mongoose.model('Course', {
  name: { type: String, required: true },
  timeSlot: { type: Number, required: true }
});

const Student = mongoose.model('Student', {
  studentId: { type: String, unique: true, required: true },
  firstName: String,
  lastName: String,
  morningCourseId: { type: Number, required: true },
  afternoonCourseId: { type: Number, required: true }
});

const Attendance = mongoose.model('Attendance', {
  studentId: Number,
  courseId: Number,
  date: String,
  status: String
});

// הגדרת multer לטיפול בהעלאת קבצים
const upload = multer({ dest: uploadsDir });

// רשימת הקורסים הקבועה
const COURSES = {
  slot1: [
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
  ],
  slot2: [
    'רכבת ההיפ הופ',
    'על קצה המזלג',
    'חוויה פיננסית',
    'עיצוב דיגיטלי',
    'משחקי תפקידים',
    'החממה להנדסת צעצועים',
    'יומן ויזואלי',
    'הכר את האויב',
    'דיבייט',
    'ביצוע יצירה והפקה',
    '*לא ידוע2*'
  ]
};

// קבלת רשימת הקורסים לפי רצועה
app.get('/api/courses/:slot', async (req, res) => {
  try {
    const slot = req.params.slot;
    if (slot !== 'slot1' && slot !== 'slot2') {
      return res.status(400).json({ error: 'רצועה לא תקינה' });
    }
    
    // קבלת כל התלמידים
    const students = await Student.find();
    
    // יצירת מיפוי קורסים למספרים
    const courseMap = new Map();
    let courseNumber = 1;
    
    [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
      // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
      const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
      const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseNumber++, courseName);
      }
    });

    // חישוב מספר התלמידים בכל קורס
    const courseCounts = new Map();
    students.forEach(student => {
      const courseId = slot === 'slot1' ? student.morningCourseId : student.afternoonCourseId;
      const courseName = courseMap.get(courseId);
      if (courseName) {
        courseCounts.set(courseName, (courseCounts.get(courseName) || 0) + 1);
      }
    });

    // יצירת רשימת הקורסים עם מספר התלמידים
    const courses = COURSES[slot].map(courseName => ({
      name: courseName,
      studentCount: courseCounts.get(courseName) || 0
    }));

    res.json(courses);
  } catch (error) {
    console.error('שגיאה בקבלת רשימת הקורסים:', error);
    res.status(500).json({ error: 'שגיאה בקבלת רשימת הקורסים' });
  }
});

// קבלת רשימת התלמידים
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find();
    
    // יצירת מיפוי קורסים למספרים
    const courseMap = new Map();
    let courseNumber = 1;
    
    [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
      // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
      const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
      const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseNumber++, courseName);
      }
    });

    // הוספת שמות הקורסים לכל תלמיד
    const studentsWithCourses = students.map(student => ({
      ...student.toObject(),
      morningCourse: courseMap.get(student.morningCourseId),
      afternoonCourse: courseMap.get(student.afternoonCourseId)
    }));

    res.json(studentsWithCourses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת נתוני נוכחות לתאריך מסוים
app.get('/api/attendance/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const attendance = await Attendance.find({ date });
    
    // קבלת כל התלמידים
    const students = await Student.find();
    const studentsMap = new Map(students.map(s => [s.studentId, s]));
    
    // יצירת מיפוי קורסים למספרים
    const courseMap = new Map();
    let courseNumber = 1;
    
    [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
      // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
      const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
      const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseNumber++, courseName);
      }
    });

    // הוספת פרטי התלמידים והקורסים
    const attendanceWithDetails = attendance.map(record => {
      const student = studentsMap.get(record.studentId);
      return {
        ...record.toObject(),
        studentName: student ? `${student.firstName} ${student.lastName}` : 'לא ידוע',
        courseName: courseMap.get(record.courseId) || 'לא ידוע'
      };
    });

    res.json(attendanceWithDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון נוכחות
app.post('/api/attendance', express.json(), async (req, res) => {
  try {
    const { studentId, date, morningPresent, afternoonPresent } = req.body;
    
    // בדיקה שהתלמיד קיים
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'תלמיד לא נמצא' });
    }

    // עדכון נוכחות בקורס בוקר
    await Attendance.findOneAndUpdate(
      { studentId, courseId: student.morningCourseId, date },
      { status: morningPresent ? 'present' : 'absent' },
      { upsert: true }
    );

    // עדכון נוכחות בקורס צהריים
    await Attendance.findOneAndUpdate(
      { studentId, courseId: student.afternoonCourseId, date },
      { status: afternoonPresent ? 'present' : 'absent' },
      { upsert: true }
    );
    
    res.json({ message: 'הנוכחות עודכנה בהצלחה' });
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
    // קריאת הקובץ שהועלה
    const students = [];
    const courses = new Set();
    const courseMap = new Map();
    let courseNumber = 1;

    // יצירת מיפוי קורסים למספרים
    [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
      // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
      const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
      const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseKey, courseNumber++);
      }
    });

    // קריאת הקובץ
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path, { encoding: 'utf8' })
        .pipe(csv({
          separator: ',',
          headers: ['studentId', 'lastName', 'firstName', 'morningCourse', 'afternoonCourse']
        }))
        .on('data', (data) => {
          // בדיקת שדות חובה
          if (!data.studentId || !data.lastName || !data.firstName || 
              !data.morningCourse || !data.afternoonCourse) {
            reject(new Error('חסרים שדות חובה בקובץ'));
            return;
          }

          // בדיקת תקינות הקורסים
          const morningCourse = data.morningCourse.trim();
          const afternoonCourse = data.afternoonCourse.trim();

          if (!COURSES.slot1.includes(morningCourse)) {
            reject(new Error(`קורס לא תקין ברצועה ראשונה: ${morningCourse}`));
            return;
          }

          if (!COURSES.slot2.includes(afternoonCourse)) {
            reject(new Error(`קורס לא תקין ברצועה שנייה: ${afternoonCourse}`));
            return;
          }

          // הוספת הקורסים לרשימה
          courses.add(morningCourse);
          courses.add(afternoonCourse);

          // הוספת התלמיד לרשימה
          students.push({
            studentId: data.studentId,
            firstName: data.firstName,
            lastName: data.lastName,
            morningCourseId: courseMap.get(morningCourse),
            afternoonCourseId: courseMap.get(afternoonCourse)
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // מחיקת כל התלמידים הקיימים
    await Student.deleteMany({});

    // הכנסת התלמידים החדשים
    await Student.insertMany(students);

    // מחיקת הקובץ
    fs.unlinkSync(req.file.path);

    res.json({ message: 'הקובץ עובד בהצלחה', students: students.length });
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

// טעינת קובץ CSV דוגמה
app.get('/api/load-sample', async (req, res) => {
  try {
    // בדיקה אם יש קורסים במערכת
    const existingCourses = await Course.find();

    // אם אין קורסים, נכניס את הרשימה המלאה
    if (existingCourses.length === 0) {
      // יצירת מיפוי קורסים למספרים
      const courseMap = new Map();
      let courseNumber = 1;
      
      // יצירת מיפוי קורסים למספרים
      [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
        // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
        const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
        const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
        if (!courseMap.has(courseKey)) {
          courseMap.set(courseKey, courseNumber++);
        }
      });

      // הכנסת הקורסים מחדש עם הרצועות הנכונות
      // קורסי רצועה ראשונה
      for (const courseName of COURSES.slot1) {
        const isInBothSlots = COURSES.slot2.includes(courseName);
        const courseKey = isInBothSlots ? `${courseName}_1` : courseName;
        await Course.create({
          name: courseName,
          timeSlot: 1
        });
      }
      
      // קורסי רצועה שנייה
      for (const courseName of COURSES.slot2) {
        const isInBothSlots = COURSES.slot1.includes(courseName);
        const courseKey = isInBothSlots ? `${courseName}_2` : courseName;
        await Course.create({
          name: courseName,
          timeSlot: 2
        });
      }
    }

    res.json({ message: 'Sample data loaded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת סטטיסטיקות נוכחות לתאריך ספציפי
app.get('/api/attendance/stats/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const attendance = await Attendance.find({ date });
    
    // קבלת כל התלמידים
    const students = await Student.find();
    
    // יצירת מיפוי קורסים למספרים
    const courseMap = new Map();
    let courseNumber = 1;
    
    [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
      // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
      const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
      const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseNumber++, courseName);
      }
    });

    // חישוב סטטיסטיקות לכל קורס
    const stats = new Map();
    attendance.forEach(record => {
      const courseName = courseMap.get(record.courseId);
      if (!stats.has(courseName)) {
        stats.set(courseName, {
          present: 0,
          absent: 0,
          total: 0,
          students: []
        });
      }
      
      const courseStats = stats.get(courseName);
      const student = students.find(s => s.studentId === record.studentId);
      courseStats.students.push({
        studentId: record.studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'לא ידוע',
        status: record.status
      });
      
      courseStats.total++;
      if (record.status === 'present') {
        courseStats.present++;
      } else {
        courseStats.absent++;
      }
    });

    // המרה למערך של אובייקטים
    const statsArray = Array.from(stats.entries()).map(([courseName, courseStats]) => ({
      courseName,
      present: courseStats.present,
      absent: courseStats.absent,
      total: courseStats.total,
      presentPercentage: Math.round((courseStats.present / courseStats.total) * 100),
      students: courseStats.students
    }));

    res.json(statsArray);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת סטטיסטיקות תלמידים לפי תאריך
app.get('/api/students/stats/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    
    // קבלת כל התלמידים
    const students = await Student.find();
    
    // קבלת כל הנוכחות בטווח התאריכים
    const attendance = await Attendance.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // יצירת מיפוי קורסים למספרים
    const courseMap = new Map();
    let courseNumber = 1;
    
    [...COURSES.slot1, ...COURSES.slot2].forEach(courseName => {
      // אם זה קורס שמופיע בשתי הרצועות, נוסיף לו סיומת
      const isInBothSlots = COURSES.slot1.includes(courseName) && COURSES.slot2.includes(courseName);
      const courseKey = isInBothSlots ? `${courseName}_${courseMap.size + 1}` : courseName;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseNumber++, courseName);
      }
    });

    // חישוב סטטיסטיקות לכל תלמיד
    const stats = new Map();
    attendance.forEach(record => {
      if (!stats.has(record.studentId)) {
        const student = students.find(s => s.studentId === record.studentId);
        stats.set(record.studentId, {
          studentName: student ? `${student.firstName} ${student.lastName}` : 'לא ידוע',
          dates: new Map(),
          totalPresent: 0,
          totalAbsent: 0,
          totalAttendance: 0,
          courses: new Set()
        });
      }
      
      const studentStats = stats.get(record.studentId);
      if (!studentStats.dates.has(record.date)) {
        studentStats.dates.set(record.date, { present: 0, absent: 0 });
      }
      
      const dateStats = studentStats.dates.get(record.date);
      studentStats.courses.add(courseMap.get(record.courseId));
      if (record.status === 'present') {
        dateStats.present++;
        studentStats.totalPresent++;
      } else {
        dateStats.absent++;
        studentStats.totalAbsent++;
      }
      studentStats.totalAttendance++;
    });

    // המרה למערך של אובייקטים
    const statsArray = Array.from(stats.entries()).map(([studentId, studentStats]) => ({
      studentId,
      studentName: studentStats.studentName,
      totalPresent: studentStats.totalPresent,
      totalAbsent: studentStats.totalAbsent,
      totalAttendance: studentStats.totalAttendance,
      presentPercentage: Math.round((studentStats.totalPresent / studentStats.totalAttendance) * 100),
      courses: Array.from(studentStats.courses),
      dates: Array.from(studentStats.dates.entries()).map(([date, dateStats]) => ({
        date,
        present: dateStats.present,
        absent: dateStats.absent,
        presentPercentage: Math.round((dateStats.present / (dateStats.present + dateStats.absent)) * 100)
      }))
    }));

    res.json(statsArray);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// קבלת סטטיסטיקות כלליות לתאריך ספציפי
app.get('/api/stats/:date', async (req, res) => {
  try {
    const date = req.params.date;
    
    // קבלת כל התלמידים
    const students = await Student.find();
    
    // קבלת כל הנוכחות לתאריך
    const attendance = await Attendance.find({ date });

    // חישוב סטטיסטיקות כלליות
    const stats = {
      totalStudents: students.length,
      totalAttendance: attendance.length,
      totalPresent: attendance.filter(record => record.status === 'present').length,
      totalAbsent: attendance.filter(record => record.status === 'absent').length,
      presentPercentage: 0,
      courseStats: {
        slot1: {},
        slot2: {}
      }
    };

    // חישוב אחוז נוכחות כללי
    stats.presentPercentage = Math.round((stats.totalPresent / stats.totalAttendance) * 100);

    // חישוב מספר התלמידים בכל קורס
    students.forEach(student => {
      const morningCourse = COURSES.slot1[student.morningCourseId - 1];
      const afternoonCourse = COURSES.slot2[student.afternoonCourseId - 1];

      if (!stats.courseStats.slot1[morningCourse]) {
        stats.courseStats.slot1[morningCourse] = {
          count: 0,
          present: 0,
          absent: 0,
          total: 0,
          presentPercentage: 0
        };
      }
      stats.courseStats.slot1[morningCourse].count++;

      if (!stats.courseStats.slot2[afternoonCourse]) {
        stats.courseStats.slot2[afternoonCourse] = {
          count: 0,
          present: 0,
          absent: 0,
          total: 0,
          presentPercentage: 0
        };
      }
      stats.courseStats.slot2[afternoonCourse].count++;
    });

    // חישוב נוכחות לפי קורס
    attendance.forEach(record => {
      const student = students.find(s => s.studentId === record.studentId);
      if (!student) return;

      const isMorningCourse = record.courseId === student.morningCourseId;
      const course = isMorningCourse ? 
        COURSES.slot1[student.morningCourseId - 1] : 
        COURSES.slot2[student.afternoonCourseId - 1];
      const slot = isMorningCourse ? 'slot1' : 'slot2';

      const courseStats = stats.courseStats[slot][course];
      courseStats.total++;
      if (record.status === 'present') {
        courseStats.present++;
      } else {
        courseStats.absent++;
      }
      courseStats.presentPercentage = Math.round((courseStats.present / courseStats.total) * 100);
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// הפעלת השרת
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
}); 