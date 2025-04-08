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