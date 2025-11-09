const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Subject = require('../models/Subject');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get student profile
router.get('/profile', authMiddleware, requireRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.userId;

    const student = await Student.findById(studentId)
      .select('-password')
      .populate('departmentId', 'name')
      .populate('semesterId', 'semesterNumber academicYear');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's subjects
router.get('/subjects', authMiddleware, requireRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.userId;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Build query - if student has semesterId, filter by it, otherwise just by department
    const query = { departmentId: student.departmentId };
    if (student.semesterId) {
      query.semesterId = student.semesterId;
    }

    const subjects = await Subject.find(query);

    res.json(subjects);
  } catch (error) {
    console.error('Get student subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance summary
router.get('/attendance-summary', authMiddleware, requireRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.userId;

    const attendance = await Attendance.find({ studentId })
      .populate('subjectId', 'name code');

    // Calculate subject-wise attendance
    const subjectStats = {};
    
    attendance.forEach(record => {
      const subjectId = record.subjectId._id.toString();
      if (!subjectStats[subjectId]) {
        subjectStats[subjectId] = {
          subject: record.subjectId,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          percentage: 0
        };
      }
      
      subjectStats[subjectId].total++;
      subjectStats[subjectId][record.status.toLowerCase()]++;
    });

    // Calculate percentages
    Object.keys(subjectStats).forEach(subjectId => {
      const stats = subjectStats[subjectId];
      const presentCount = stats.present + stats.late;
      stats.percentage = stats.total > 0 ? (presentCount / stats.total) * 100 : 0;
    });

    // Overall stats
    const totalClasses = attendance.length;
    const totalPresent = attendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const overallPercentage = totalClasses > 0 ? (totalPresent / totalClasses) * 100 : 0;

    res.json({
      overall: {
        totalClasses,
        totalPresent,
        percentage: Math.round(overallPercentage * 100) / 100
      },
      subjects: Object.values(subjectStats)
    });

  } catch (error) {
    console.error('Get attendance summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;