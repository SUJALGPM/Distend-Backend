const express = require('express');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Department = require('../models/Department');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all users
router.get('/users', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let users = [];
    let total = 0;

    if (!role || role === 'all') {
      // Get all users
      const teachers = await Teacher.find()
        .select('-teacherPassword')
        .skip(skip)
        .limit(parseInt(limit));
      
      const students = await Student.find()
        .select('-password')
        .populate('departmentId', 'name')
        .skip(skip)
        .limit(parseInt(limit));

      users = [
        ...teachers.map(t => ({ ...t.toObject(), role: 'teacher' })),
        ...students.map(s => ({ ...s.toObject(), role: 'student' }))
      ];

      total = await Teacher.countDocuments() + await Student.countDocuments();
    } else if (role === 'teacher') {
      const query = search ? {
        $or: [
          { teacherName: { $regex: search, $options: 'i' } },
          { teacherEmail: { $regex: search, $options: 'i' } }
        ]
      } : {};

      const teachers = await Teacher.find(query)
        .select('-teacherPassword')
        .skip(skip)
        .limit(parseInt(limit));

      users = teachers.map(t => ({ ...t.toObject(), role: 'teacher' }));
      total = await Teacher.countDocuments(query);
    } else if (role === 'student') {
      const query = search ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { studentId: { $regex: search, $options: 'i' } }
        ]
      } : {};

      const students = await Student.find(query)
        .select('-password')
        .populate('departmentId', 'name')
        .skip(skip)
        .limit(parseInt(limit));

      users = students.map(s => ({ ...s.toObject(), role: 'student' }));
      total = await Student.countDocuments(query);
    }

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: users.length,
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create teacher
router.post('/teachers', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { teacherName, teacherEmail, teacherPassword, teacherGender, teacherNumber, department } = req.body;
    const adminId = req.user.userId;

    // Check if teacher already exists
    const existingTeacher = await Teacher.findOne({ teacherEmail });
    if (existingTeacher) {
      return res.status(400).json({ message: 'Teacher already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(teacherPassword, 10);

    const teacher = new Teacher({
      teacherName,
      teacherEmail,
      teacherPassword: hashedPassword,
      teacherGender,
      teacherNumber,
      department,
      createdBy: adminId
    });

    await teacher.save();

    // Add teacher to admin's teachers list
    await Admin.findByIdAndUpdate(adminId, {
      $push: { Teachers: teacher._id }
    });

    res.json({
      message: 'Teacher created successfully',
      teacher: {
        ...teacher.toObject(),
        teacherPassword: undefined
      }
    });

  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create student
router.post('/students', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { name, studentId, email, password, division, batch, contactNumber, gender, departmentId, semesterId } = req.body;

    // Check if student already exists
    const existingStudent = await Student.findOne({
      $or: [{ email }, { studentId }]
    });
    
    if (existingStudent) {
      return res.status(400).json({ message: 'Student already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const student = new Student({
      name,
      studentId,
      email,
      password: hashedPassword,
      division,
      batch,
      contactNumber,
      gender,
      departmentId,
      semesterId
    });

    await student.save();

    res.json({
      message: 'Student created successfully',
      student: {
        ...student.toObject(),
        password: undefined
      }
    });

  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create department
router.post('/departments', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;
    const adminId = req.user.userId;

    // Check if department already exists
    const existingDepartment = await Department.findOne({ name });
    if (existingDepartment) {
      return res.status(400).json({ message: 'Department already exists' });
    }

    const department = new Department({
      name,
      description,
      createdBy: adminId
    });

    await department.save();

    // Add department to admin's departments list
    await Admin.findByIdAndUpdate(adminId, {
      $push: { Departments: department._id }
    });

    res.json({
      message: 'Department created successfully',
      department
    });

  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all departments (accessible by authenticated users for dropdowns)
router.get('/departments', authMiddleware, async (req, res) => {
  try {
    const departments = await Department.find().select('_id name description');
    res.json(departments);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get semesters by department (accessible by authenticated users for dropdowns)
router.get('/departments/:departmentId/semesters', authMiddleware, async (req, res) => {
  try {
    const { departmentId } = req.params;
    const Semester = require('../models/Semester');
    
    const semesters = await Semester.find({ departmentId }).select('_id semesterNumber academicYear startMonth endMonth');
    res.json(semesters);
  } catch (error) {
    console.error('Get semesters error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get system settings
router.get('/settings', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    // Return default settings - in a real app, these would be stored in database
    const settings = {
      attendanceThreshold: 75,
      defaulterAlertThreshold: 70,
      autoNotifyDefaulters: true,
      allowGrievanceSubmission: true,
      maxGrievanceAttachments: 5,
      csvUploadMaxSize: 5, // MB
      sessionTimeout: 24 // hours
    };

    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update system settings
router.put('/settings', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const settings = req.body;
    
    // In a real app, save to database
    // For now, just return success
    
    res.json({
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle user active status
router.put('/users/:userId/toggle-status', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    let user;
    if (role === 'teacher') {
      user = await Teacher.findById(userId);
    } else if (role === 'student') {
      user = await Student.findById(userId);
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Toggle active status (add isActive field if not exists)
    const newStatus = !user.isActive;
    
    if (role === 'teacher') {
      await Teacher.findByIdAndUpdate(userId, { isActive: newStatus });
    } else {
      await Student.findByIdAndUpdate(userId, { isActive: newStatus });
    }

    res.json({
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;