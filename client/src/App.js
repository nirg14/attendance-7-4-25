import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// הגדרת ה-base URL של השרת
axios.defaults.baseURL = window.location.origin;

const AttendanceSystem = () => {
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState({});
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState('');

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
    }
  }, [courses, students]);

  // בדיקת נוכחות אחרי כל עדכון של הנתונים
  useEffect(() => {
    if (courses.length > 0 && students.length > 0) {
      checkAfternoonAttendance();
    }
  }, [courses, students, attendanceData, checkAfternoonAttendance]);

  // טעינת נתונים מהשרת
  useEffect(() => {
    const fetchData = async () => {
      try {
        // טעינת קורסים
        const [slot1Response, slot2Response] = await Promise.all([
          axios.get('/api/courses/slot1'),
          axios.get('/api/courses/slot2')
        ]);
        
        const allCourses = [
          ...slot1Response.data.map(course => ({ ...course, timeSlot: 1 })),
          ...slot2Response.data.map(course => ({ ...course, timeSlot: 2 }))
        ];
        
        setCourses(allCourses);
        
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

  // עדכון נוכחות תלמיד
  const toggleAttendance = async (studentId, courseId, timeSlot) => {
    const key = `${studentId}_${courseId}_${date}`;
    const present = !isStudentPresent(studentId, courseId);
    
    try {
      await axios.post('/api/attendance', {
        date,
        studentId,
        courseId,
        present
      });
      
      const newAttendanceData = { ...attendanceData };
      if (!newAttendanceData[key]) {
        newAttendanceData[key] = { present };
      } else {
        newAttendanceData[key].present = present;
      }
      
      setAttendanceData(newAttendanceData);
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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setAlertMessage('נדרש קובץ נתונים');
      setAlertType('warning');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.message) {
        setAlertMessage('הנתונים הועלו בהצלחה');
        setAlertType('success');
        window.location.reload();
      }
    } catch (error) {
      setAlertMessage('שגיאה בהעלאת הנתונים: ' + (error.response?.data?.error || error.message));
      setAlertType('warning');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="rtl text-center p-8">טוען נתונים...</div>;
  }

  return (
    <div className="rtl text-right p-4 bg-gray-100 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-blue-600 text-center">מערכת מעקב נוכחות - בית ספר למחוננים</h1>
        
        {alertMessage && (
          <div className={`alert ${alertType === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
            {alertMessage}
          </div>
        )}
        
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4 text-center">עדכון נתוני המערכת</h2>
          <div className="mb-4">
            <label className="block mb-2 font-semibold">העלאת קובץ נתונים חדש:</label>
            <div className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">
              העלה קובץ CSV עם העמודות הבאות:<br />
              מספר תלמיד, שם משפחה, שם פרטי, קורס רצועה ראשונה, קורס רצועה שנייה
            </p>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 font-semibold">תאריך:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="date-picker w-full"
          />
        </div>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-center">בחר קורס:</h2>
          
          <div className="mb-4">
            <h3 className="font-semibold text-blue-500 text-center">רצועה 1 (בוקר):</h3>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {courses
                .filter(course => course.timeSlot === 1)
                .map(course => (
                  <button
                    key={course.id}
                    onClick={() => selectCourse(course)}
                    className={`course-button ${selectedCourse?.id === course.id ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-100'}`}
                  >
                    {course.name}
                  </button>
                ))
              }
            </div>
          </div>
          
          <div className="mb-4">
            <h3 className="font-semibold text-green-500 text-center">רצועה 2 (צהריים):</h3>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {courses
                .filter(course => course.timeSlot === 2)
                .map(course => (
                  <button
                    key={course.id}
                    onClick={() => selectCourse(course)}
                    className={`course-button ${selectedCourse?.id === course.id ? 'bg-green-500 text-white' : 'bg-white hover:bg-green-100'}`}
                  >
                    {course.name}
                  </button>
                ))
              }
            </div>
          </div>
        </div>
        
        {selectedCourse && (
          <div className="overflow-x-auto">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th className="border p-2">שם תלמיד</th>
                  <th className="border p-2">נוכחות</th>
                </tr>
              </thead>
              <tbody>
                {selectedCourse.students?.map(student => (
                  <tr key={student.id}>
                    <td className="student-name-cell">
                      <span>{student.name}</span>
                    </td>
                    <td className="border p-2">
                      <div className="attendance-checkbox-container">
                        <label className="attendance-checkbox-label">
                          <input
                            type="checkbox"
                            checked={isStudentPresent(student.id, selectedCourse.id)}
                            onChange={() => toggleAttendance(student.id, selectedCourse.id, selectedCourse.timeSlot)}
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="attendance-report">
          <h3>חסרים ברצועה 2</h3>
          {(() => {
            const missingStudents = students.filter(student => {
              const morningKey = `${student.id}_${student.morningCourse}_${date}`;
              const afternoonKey = `${student.id}_${student.afternoonCourse}_${date}`;
              
              return (
                attendanceData[morningKey]?.present === true && 
                (!attendanceData[afternoonKey] || attendanceData[afternoonKey].present === false)
              );
            });

            if (missingStudents.length > 0) {
              return (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>שם תלמיד</th>
                      <th>קורס ברצועה 1</th>
                      <th>קורס ברצועה 2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingStudents.map(student => (
                      <tr key={student.id} className="warning">
                        <td>{student.name}</td>
                        <td>{courses.find(c => c.id === student.morningCourse)?.name}</td>
                        <td>{courses.find(c => c.id === student.afternoonCourse)?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            } else {
              return (
                <table className="report-table">
                  <tbody>
                    <tr>
                      <td className="no-warnings">אין תלמידים נוכחים ברצועה 1 ונעדרים ברצועה 2</td>
                    </tr>
                  </tbody>
                </table>
              );
            }
          })()}
        </div>
      </div>
    </div>
  );
};

export default AttendanceSystem;