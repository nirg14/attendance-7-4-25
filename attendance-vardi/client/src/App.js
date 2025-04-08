import React, { useEffect, useState } from 'react';
import axios from 'axios';

// הכנת מידע על תלמידים בכל קורס
useEffect(() => {
  if (courses.length > 0 && students.length > 0) {
    const updatedCourses = courses.map(course => {
      const courseStudents = students.filter(student => 
        (student.morningCourse === course.id && course.timeSlot === 1) || 
        (student.afternoonCourse === course.id && course.timeSlot === 2)
      );
      
      // הוספת נתוני נוכחות לכל תלמיד
      const studentsWithAttendance = courseStudents.map(student => ({
        ...student,
        present: isStudentPresent(student.id, course.id)
      }));
      
      return { ...course, students: studentsWithAttendance };
    });
    setCourses(updatedCourses);
  }
}, [courses, students, attendanceData, isStudentPresent]);

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
    newAttendanceData[key] = { present };
    
    setAttendanceData(newAttendanceData);
    
    // עדכון רשימת התלמידים בקורס
    const updatedCourses = courses.map(course => {
      if (course.id === courseId) {
        const updatedStudents = course.students.map(student => {
          if (student.id === studentId) {
            return { ...student, present };
          }
          return student;
        });
        return { ...course, students: updatedStudents };
      }
      return course;
    });
    
    setCourses(updatedCourses);
    checkAfternoonAttendance();
  } catch (error) {
    console.error('Error updating attendance:', error);
  }
};

// ... existing code ... 