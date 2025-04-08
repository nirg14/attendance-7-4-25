const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const port = process.env.PORT || 3000;

// הגדרת מסד הנתונים
const db = new sqlite3.Database('attendance.db');

// יצירת טבלאות אם הן לא קיימות
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    timeSlot INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    studentId TEXT NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    morningCourseId INTEGER,
    afternoonCourseId INTEGER,
    FOREIGN KEY (morningCourseId) REFERENCES courses (id),
    FOREIGN KEY (afternoonCourseId) REFERENCES courses (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId INTEGER NOT NULL,
    courseId INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (studentId) REFERENCES students (id),
    FOREIGN KEY (courseId) REFERENCES courses (id)
  )`);
});

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

// הגדרת multer לטיפול בהעלאת קבצים
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// טיפול בהעלאת קובץ CSV
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'לא נבחר קובץ' });
  }

  try {
    // בדיקה אם יש קורסים במערכת
    const existingCourses = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM courses', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

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
      const coursesToInsert = [
        // קורסי רצועה ראשונה
        ...slot1Courses.map(courseName => {
          const isInBothSlots = slot2Courses.includes(courseName);
          const courseKey = isInBothSlots ? `${courseName}_1` : courseName;
          return {
            id: courseMap.get(courseKey),
            name: courseName,
            timeSlot: 1
          };
        }),
        // קורסי רצועה שנייה
        ...slot2Courses.map(courseName => {
          const isInBothSlots = slot1Courses.includes(courseName);
          const courseKey = isInBothSlots ? `${courseName}_2` : courseName;
          return {
            id: courseMap.get(courseKey),
            name: courseName,
            timeSlot: 2
          };
        })
      ];

      // הכנסת הקורסים החדשים
      for (const course of coursesToInsert) {
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO courses (id, name, timeSlot) VALUES (?, ?, ?)', 
            [course.id, course.name, course.timeSlot], 
            (err) => {
              if (err) reject(err);
              else resolve();
            });
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
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM students', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // הכנסת התלמידים החדשים
    for (const student of students) {
      // מציאת ה-ID של הקורסים
      const morningCourseId = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM courses WHERE name = ? AND timeSlot = 1', 
          [student.morningCourse], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.id : null);
          });
      });

      const afternoonCourseId = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM courses WHERE name = ? AND timeSlot = 2', 
          [student.afternoonCourse], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.id : null);
          });
      });

      await new Promise((resolve, reject) => {
        db.run('INSERT INTO students (studentId, firstName, lastName, morningCourseId, afternoonCourseId) VALUES (?, ?, ?, ?, ?)',
          [student.studentId, student.firstName, student.lastName, morningCourseId, afternoonCourseId],
          (err) => {
            if (err) reject(err);
            else resolve();
          });
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
app.get('/courses', (req, res) => {
  db.all('SELECT * FROM courses ORDER BY timeSlot, name', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// קבלת רשימת התלמידים
app.get('/students', (req, res) => {
  db.all(`
    SELECT s.*, 
           c1.name as morningCourseName,
           c2.name as afternoonCourseName
    FROM students s
    LEFT JOIN courses c1 ON s.morningCourseId = c1.id
    LEFT JOIN courses c2 ON s.afternoonCourseId = c2.id
    ORDER BY s.lastName, s.firstName
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// שמירת נוכחות
app.post('/attendance', (req, res) => {
  const { studentId, courseId, date, status } = req.body;
  
  db.run('INSERT INTO attendance (studentId, courseId, date, status) VALUES (?, ?, ?, ?)',
    [studentId, courseId, date, status],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    });
});

// קבלת נוכחות
app.get('/attendance', (req, res) => {
  const { date, courseId } = req.query;
  
  db.all(`
    SELECT a.*, s.firstName, s.lastName, s.studentId
    FROM attendance a
    JOIN students s ON a.studentId = s.id
    WHERE a.date = ? AND a.courseId = ?
    ORDER BY s.lastName, s.firstName
  `, [date, courseId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// הפעלת השרת
app.listen(port, () => {
  console.log(`השרת פועל על פורט ${port}`);
}); 