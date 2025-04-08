import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const LoginForm = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/login', { username, password });
      if (response.data.success) {
        onLogin();
      }
    } catch (error) {
      setError(error.response?.data?.message || 'שגיאה בהתחברות');
    }
  };

  return (
    <div className="login-container">
      <h2>התחברות למערכת</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>שם משתמש:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>סיסמה:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        <button type="submit">התחבר</button>
      </form>
    </div>
  );
};

const AttendanceSystem = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // מידע על הקורסים והתלמידים
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState({});
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // בדיקת תלמידים שנוכחים בבוקר אך לא אחר הצהריים
  const checkAfternoonAttendance = useCallback(() => {
    const missingStudents = students.filter(student => {
      const morningKey = `${student.id}_${student.morningCourse}_${date}`;
      const afternoonKey = `${student.id}_${student.afternoonCourse}_${date}`;
      
      return (
        attendanceData[morningKey]?.present === true && 
        (!attendanceData[afternoonKey] || attendanceData[afternoonKey].present === false)
      );
    });
    
    if (missingStudents.length > 0) {
      setAlertMessage(`שים לב: ${missingStudents.length} תלמידים נוכחים בבוקר אך חסרים אחר הצהריים`);
      setAlertType('warning');
    } else {
      setAlertMessage('');
    }
  }, [students, date, attendanceData]);

  // טעינת נתונים מהשרת
  useEffect(() => {
    const fetchData = async () => {
      try {
        // טעינת קורסים
        const coursesResponse = await axios.get('/api/courses');
        setCourses(coursesResponse.data);
        
        // טעינת תלמידים
        const studentsResponse = await axios.get('/api/students');
        setStudents(studentsResponse.data);
        
        // טעינת נוכחות לתאריך
        const attendanceResponse = await axios.get(`/api/attendance/${date}`);
        
        // המרה למבנה נתונים נוח לשימוש
        const formattedAttendance = {};
        attendanceResponse.data.forEach(record => {
          const key = `${record.studentId}_${record.courseId}_${record.date}`;
          formattedAttendance[key] = { present: record.present };
        });
        
        setAttendanceData(formattedAttendance);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [date]);

  // הכנת מידע על תלמידים בכל קורס
  useEffect(() => {
    if (courses.length > 0 && students.length > 0) {
      const updatedCourses = courses.map(course => {
        const courseStudents = students.filter(student => 
          (student.morningCourse === course.id && course.timeSlot === 1) || 
          (student.afternoonCourse === course.id && course.timeSlot === 2)
        );
        return { ...course, students: courseStudents };
      });
      setCourses(updatedCourses);
      
      // בדיקת תלמידים שנוכחים בבוקר אך לא אחר הצהריים
      checkAfternoonAttendance();
    }
  }, [courses, students, attendanceData, checkAfternoonAttendance]);

  // עדכון נוכחות תלמיד
  const toggleAttendance = async (studentId, courseId, timeSlot) => {
    const key = `${studentId}_${courseId}_${date}`;
    const present = !isStudentPresent(studentId, courseId);
    
    try {
      // שליחת עדכון לשרת
      await axios.post('/api/attendance', {
        date,
        studentId,
        courseId,
        present
      });
      
      // עדכון מקומי
      const newAttendanceData = { ...attendanceData };
      if (!newAttendanceData[key]) {
        newAttendanceData[key] = { present };
      } else {
        newAttendanceData[key].present = present;
      }
      
      setAttendanceData(newAttendanceData);
      
      // בדיקת תלמידים שנוכחים בבוקר אך לא אחר הצהריים
      checkAfternoonAttendance();
    } catch (error) {
      console.error('Error updating attendance:', error);
    }
  };

  // בחירת קורס להצגה
  const selectCourse = (course) => {
    setSelectedCourse(course);
  };

  // האם תלמיד נוכח בקורס
  const isStudentPresent = (studentId, courseId) => {
    const key = `${studentId}_${courseId}_${date}`;
    return attendanceData[key]?.present === true;
  };

  // אתחול הנתונים בשרת (רק לצורך פיתוח)
  const initializeData = async () => {
    try {
      setIsLoading(true);
      await axios.post('/api/init/courses');
      await axios.post('/api/init/students');
      window.location.reload();
    } catch (error) {
      console.error('Error initializing data:', error);
      setIsLoading(false);
    }
  };

  if (!isLoggedIn) {
    return <LoginForm onLogin={() => setIsLoggedIn(true)} />;
  }

  if (isLoading) {
    return <div className="rtl text-center p-8">טוען נתונים...</div>;
  }

  return (
    <div className="rtl text-right p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-blue-600">מערכת מעקב נוכחות - בית ספר למחוננים</h1>
      
      {/* כפתור אתחול נתונים */}
      <button 
        onClick={initializeData}
        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2 rounded text-sm mb-4"
      >
        אתחל נתונים לדוגמה
      </button>
      
      {/* בחירת תאריך */}
      <div className="mb-6">
        <label className="block mb-2 font-semibold">תאריך:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="p-2 border rounded"
        />
      </div>
      
      {/* רצועות זמן וקורסים */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">בחר קורס:</h2>
        
        <div className="mb-4">
          <h3 className="font-semibold text-blue-500">רצועה 1 (בוקר):</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {courses
              .filter(course => course.timeSlot === 1)
              .map(course => (
                <button
                  key={course.id}
                  onClick={() => selectCourse(course)}
                  className={`p-2 border rounded ${selectedCourse?.id === course.id ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-100'}`}
                >
                  {course.name}
                </button>
              ))
            }
          </div>
        </div>
        
        <div className="mb-4">
          <h3 className="font-semibold text-green-500">רצועה 2 (צהריים):</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {courses
              .filter(course => course.timeSlot === 2)
              .map(course => (
                <button
                  key={course.id}
                  onClick={() => selectCourse(course)}
                  className={`p-2 border rounded ${selectedCourse?.id === course.id ? 'bg-green-500 text-white' : 'bg-white hover:bg-green-100'}`}
                >
                  {course.name}
                </button>
              ))
            }
          </div>
        </div>
      </div>
      
      {/* התראה על תלמידים חסרים */}
      {alertMessage && (
        <div className={`p-4 mb-4 rounded ${alertType === 'warning' ? 'bg-yellow-100 border-yellow-400 text-yellow-800' : ''}`}>
          {alertMessage}
        </div>
      )}
      
      {/* רשימת תלמידים בקורס הנבחר */}
      {selectedCourse && (
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">
            {`נוכחות: ${selectedCourse.name} (${selectedCourse.timeSlot === 1 ? 'בוקר' : 'צהריים'})`}
          </h2>
          
          {selectedCourse.students.length === 0 ? (
            <p>אין תלמידים רשומים לקורס זה.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="p-2 text-right">שם התלמיד</th>
                  <th className="p-2 text-center">נוכחות</th>
                  <th className="p-2 text-center">סטטוס כללי</th>
                </tr>
              </thead>
              <tbody>
                {selectedCourse.students.map(student => {
                  // בדיקה האם התלמיד נוכח גם בקורס השני
                  const otherCourseId = selectedCourse.timeSlot === 1 ? student.afternoonCourse : student.morningCourse;
                  const isPresentInThisCourse = isStudentPresent(student.id, selectedCourse.id);
                  const isPresentInOtherCourse = isStudentPresent(student.id, otherCourseId);
                  
                  // קביעת סטטוס כללי
                  let status = '';
                  let statusClass = '';
                  
                  if (selectedCourse.timeSlot === 1) {
                    if (isPresentInThisCourse && !isPresentInOtherCourse) {
                      status = 'חסר אחה"צ';
                      statusClass = 'text-yellow-500';
                    } else if (isPresentInThisCourse && isPresentInOtherCourse) {
                      status = 'נוכח בשני הקורסים';
                      statusClass = 'text-green-500';
                    }
                  } else { // צהריים
                    if (!isPresentInOtherCourse && isPresentInThisCourse) {
                      status = 'חסר בבוקר';
                      statusClass = 'text-orange-500';
                    } else if (isPresentInOtherCourse && isPresentInThisCourse) {
                      status = 'נוכח בשני הקורסים';
                      statusClass = 'text-green-500';
                    }
                  }
                  
                  return (
                    <tr key={student.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{student.name}</td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isPresentInThisCourse}
                          onChange={() => toggleAttendance(student.id, selectedCourse.id, selectedCourse.timeSlot)}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className={`p-3 text-center ${statusClass} font-medium`}>
                        {status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      
      {/* תצוגת דוח יומי - כל התלמידים החסרים */}
      <div className="mt-8 bg-white p-4 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">דוח נוכחות יומי ({date})</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-200">
                <th className="p-2 text-right">שם התלמיד</th>
                <th className="p-2 text-center">נוכחות בוקר</th>
                <th className="p-2 text-center">נוכחות צהריים</th>
                <th className="p-2 text-center">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {students.map(student => {
                const morningPresent = isStudentPresent(student.id, student.morningCourse);
                const afternoonPresent = isStudentPresent(student.id, student.afternoonCourse);
                
                let status = '';
                let statusClass = '';
                
                if (morningPresent && afternoonPresent) {
                  status = 'נוכח מלא';
                  statusClass = 'text-green-500';
                } else if (morningPresent && !afternoonPresent) {
                  status = 'חסר אחה"צ';
                  statusClass = 'text-yellow-500';
                } else if (!morningPresent && afternoonPresent) {
                  status = 'חסר בבוקר';
                  statusClass = 'text-orange-500';
                } else {
                  status = 'לא נוכח';
                  statusClass = 'text-red-500';
                }
                
                // מצא את שמות הקורסים
                const morningCourseName = courses.find(c => c.id === student.morningCourse)?.name;
                const afternoonCourseName = courses.find(c => c.id === student.afternoonCourse)?.name;
                
                return (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{student.name}</td>
                    <td className="p-3 text-center">
                      <span title={morningCourseName}>
                        {morningPresent ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span title={afternoonCourseName}>
                        {afternoonPresent ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className={`p-3 text-center ${statusClass} font-medium`}>
                      {status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AttendanceSystem;