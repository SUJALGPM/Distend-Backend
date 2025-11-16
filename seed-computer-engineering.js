const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect('mongodb://localhost:27017/attendance-system', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const Admin = require('./models/Admin');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Department = require('./models/Department');
const Semester = require('./models/Semester');
const Subject = require('./models/Subject');
const Allocation = require('./models/Allocation');
const Attendance = require('./models/Attendance');

async function seedComputerEngineering() {
  try {
    console.log('🗑️  Clearing existing data...\n');
    
    await Admin.deleteMany({});
    await Teacher.deleteMany({});
    await Student.deleteMany({});
    await Department.deleteMany({});
    await Semester.deleteMany({});
    await Subject.deleteMany({});
    await Allocation.deleteMany({});
    await Attendance.deleteMany({});
    
    console.log('✓ All collections cleared\n');
    
    // ==========================================
    // 1. CREATE DEPARTMENT
    // ==========================================
    console.log('📚 Creating Department...');
    const department = await Department.create({
      name: 'Computer Engineering',
      description: 'Computer Engineering Department'
    });
    console.log(`✓ Created Computer Engineering department\n`);
    
    // ==========================================
    // 2. CREATE SEMESTERS (4 semesters for demo)
    // ==========================================
    console.log('📅 Creating Semesters...');
    const semesters = await Semester.insertMany([
      { departmentId: department._id, semesterNumber: 1, academicYear: 2024, startMonth: 'August', endMonth: 'December' },
      { departmentId: department._id, semesterNumber: 2, academicYear: 2025, startMonth: 'January', endMonth: 'May' },
      { departmentId: department._id, semesterNumber: 3, academicYear: 2024, startMonth: 'August', endMonth: 'December' },
      { departmentId: department._id, semesterNumber: 4, academicYear: 2025, startMonth: 'January', endMonth: 'May' }
    ]);
    console.log(`✓ Created ${semesters.length} semesters\n`);
    
    // ==========================================
    // 3. CREATE SUBJECTS
    // ==========================================
    console.log('📖 Creating Subjects...');
    const subjects = await Subject.insertMany([
      // Semester 1
      { name: 'Engineering Mathematics I', code: 'CE101', departmentId: department._id, semesterId: semesters[0]._id },
      { name: 'Engineering Physics', code: 'CE102', departmentId: department._id, semesterId: semesters[0]._id },
      { name: 'Programming in C', code: 'CE103', departmentId: department._id, semesterId: semesters[0]._id },
      { name: 'Engineering Graphics', code: 'CE104', departmentId: department._id, semesterId: semesters[0]._id },
      { name: 'Basic Electronics', code: 'CE105', departmentId: department._id, semesterId: semesters[0]._id },
      
      // Semester 2
      { name: 'Engineering Mathematics II', code: 'CE201', departmentId: department._id, semesterId: semesters[1]._id },
      { name: 'Data Structures', code: 'CE202', departmentId: department._id, semesterId: semesters[1]._id },
      { name: 'Digital Electronics', code: 'CE203', departmentId: department._id, semesterId: semesters[1]._id },
      { name: 'Object Oriented Programming', code: 'CE204', departmentId: department._id, semesterId: semesters[1]._id },
      { name: 'Computer Organization', code: 'CE205', departmentId: department._id, semesterId: semesters[1]._id }
    ]);
    console.log(`✓ Created ${subjects.length} subjects\n`);
    
    // ==========================================
    // 4. CREATE ADMIN
    // ==========================================
    console.log('👤 Creating Admin...');
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const admin = await Admin.create({
      adminId: 'admin@college.edu',
      adminName: 'System Administrator',
      adminPassword: hashedAdminPassword,
      adminGender: 'Male',
      adminNumber: '9876543210'
    });
    console.log(`✓ Admin created\n`);
    
    // ==========================================
    // 5. CREATE TEACHERS
    // ==========================================
    console.log('👨‍🏫 Creating Teachers...');
    const hashedTeacherPassword = await bcrypt.hash('teacher123', 10);
    
    const teachers = [];
    const teacherData = [
      { name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@college.edu', gender: 'Male' },
      { name: 'Prof. Priya Sharma', email: 'priya.sharma@college.edu', gender: 'Female' },
      { name: 'Dr. Amit Patel', email: 'amit.patel@college.edu', gender: 'Male' },
      { name: 'Prof. Sunita Verma', email: 'sunita.verma@college.edu', gender: 'Female' },
      { name: 'Dr. Vikram Singh', email: 'vikram.singh@college.edu', gender: 'Male' }
    ];
    
    for (const t of teacherData) {
      const teacher = await Teacher.create({
        teacherName: t.name,
        teacherEmail: t.email,
        teacherPassword: hashedTeacherPassword,
        teacherGender: t.gender,
        teacherNumber: `98${Math.floor(Math.random() * 100000000)}`,
        department: 'Computer Engineering',
        createdBy: admin._id
      });
      teachers.push(teacher);
    }
    console.log(`✓ Created ${teachers.length} teachers\n`);
    
    // ==========================================
    // 6. CREATE STUDENTS (80 students - 40 per semester)
    // ==========================================
    console.log('👨‍🎓 Creating Students...');
    const students = [];
    const divisions = ['A', 'B', 'C', 'D'];
    const batches = {
      'A': ['A1', 'A2', 'A3', 'A4'],
      'B': ['B1', 'B2', 'B3', 'B4'],
      'C': ['C1', 'C2', 'C3', 'C4'],
      'D': ['D1', 'D2', 'D3', 'D4']
    };
    
    const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Ananya', 'Diya', 'Isha', 'Priya', 'Riya', 
                        'Rohan', 'Karan', 'Rahul', 'Amit', 'Raj', 'Neha', 'Pooja', 'Sneha', 'Kavya', 'Shreya'];
    const lastNames = ['Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Gupta', 'Nair', 'Desai', 'Mehta',
                       'Shah', 'Joshi', 'Rao', 'Iyer', 'Pillai', 'Menon', 'Agarwal', 'Bansal', 'Chopra', 'Malhotra'];
    
    const hashedStudentPassword = await bcrypt.hash('student123', 10);
    let studentCounter = 1;
    
    // Create students for Semester 1 and 2
    for (let semIdx = 0; semIdx < 2; semIdx++) {
      for (const division of divisions) {
        for (let i = 0; i < 10; i++) {
          const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
          const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
          const batch = batches[division][i % 4];
          
          const student = await Student.create({
            name: `${firstName} ${lastName}`,
            studentId: `CE2024${String(studentCounter).padStart(3, '0')}`,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${studentCounter}@student.edu`,
            password: hashedStudentPassword,
            division: division,
            batch: batch,
            contactNumber: `98${Math.floor(Math.random() * 100000000)}`,
            gender: Math.random() > 0.5 ? 'Male' : 'Female',
            departmentId: department._id,
            semesterId: semesters[semIdx]._id
          });
          
          students.push(student);
          studentCounter++;
        }
      }
    }
    
    console.log(`✓ Created ${students.length} students\n`);
    
    // ==========================================
    // 7. CREATE ALLOCATIONS
    // ==========================================
    console.log('📋 Creating Allocations...');
    const allocations = [];
    
    // Allocate subjects to teachers
    for (let i = 0; i < subjects.length; i++) {
      const teacher = teachers[i % teachers.length];
      const subject = subjects[i];
      
      // Get students for this semester
      const subjectStudents = students.filter(s => s.semesterId.equals(subject.semesterId));
      
      // Create Theory allocation
      const theoryAllocation = await Allocation.create({
        teacherId: teacher._id,
        subjectId: subject._id,
        students: subjectStudents.map(s => s._id),
        type: 'Theory',
        division: 'All',
        totalPlanned: 40,
        totalConducted: 30
      });
      allocations.push(theoryAllocation);
      
      // Create Practical allocation
      const practicalAllocation = await Allocation.create({
        teacherId: teacher._id,
        subjectId: subject._id,
        students: subjectStudents.map(s => s._id),
        type: 'Practical',
        division: 'All',
        totalPlanned: 30,
        totalConducted: 25
      });
      allocations.push(practicalAllocation);
    }
    
    console.log(`✓ Created ${allocations.length} allocations\n`);
    
    // ==========================================
    // 8. CREATE REALISTIC ATTENDANCE RECORDS
    // ==========================================
    console.log('📊 Creating Attendance Records...');
    let attendanceCount = 0;
    
    // Create attendance for current month (to show in analytics)
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const dates = [];
    
    // Get all days in current month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    for (let day = 1; day <= Math.min(daysInMonth, today.getDate()); day++) {
      const date = new Date(currentYear, currentMonth, day);
      // Skip weekends
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        dates.push(date);
      }
    }
    
    console.log(`  Creating attendance for ${dates.length} working days in current month...\n`);
    
    // For each allocation, create attendance records
    for (const allocation of allocations) {
      const subject = subjects.find(s => s._id.equals(allocation.subjectId));
      const subjectStudents = students.filter(s => s.semesterId.equals(subject.semesterId));
      
      // Create attendance for random dates (not all dates, to be realistic)
      const numClasses = allocation.type === 'Theory' ? 30 : 25;
      const selectedDates = dates.slice(0, numClasses);
      
      for (const date of selectedDates) {
        for (const student of subjectStudents) {
          // 85% attendance rate (realistic and good)
          const random = Math.random();
          let status;
          
          if (random < 0.85) {
            status = 'Present';
          } else if (random < 0.92) {
            status = 'Absent';
          } else if (random < 0.97) {
            status = 'Late';
          } else {
            status = 'Excused';
          }
          
          await Attendance.create({
            studentId: student._id,
            subjectId: allocation.subjectId,
            status: status,
            type: allocation.type,
            recordedBy: allocation.teacherId,
            createdAtDate: date.toISOString().split('T')[0].replace(/-/g, '/'),
            createdAtTime: allocation.type === 'Theory' ? '10:00:00' : '14:00:00'
          });
          
          attendanceCount++;
        }
      }
    }
    
    console.log(`✓ Created ${attendanceCount} attendance records\n`);
    
    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('========================================');
    console.log('✅ COMPUTER ENGINEERING DATA SEEDED!');
    console.log('========================================\n');
    
    console.log('📊 Summary:');
    console.log(`  Department: Computer Engineering`);
    console.log(`  Semesters: ${semesters.length}`);
    console.log(`  Subjects: ${subjects.length}`);
    console.log(`  Teachers: ${teachers.length}`);
    console.log(`  Students: ${students.length}`);
    console.log(`  Allocations: ${allocations.length}`);
    console.log(`  Attendance Records: ${attendanceCount}`);
    console.log(`  Average Attendance: ~85%\n`);
    
    console.log('🔑 Login Credentials:');
    console.log('  Admin: admin@college.edu / admin123\n');
    
    console.log('👥 Teacher Logins:');
    teachers.forEach(t => console.log(`  ${t.teacherEmail} / teacher123`));
    console.log('');
    
    console.log('🎓 Sample Student Logins:');
    students.slice(0, 5).forEach(s => {
      console.log(`  ${s.email} / student123 (${s.studentId})`);
    });
    console.log('');
    
    console.log('📚 Subjects by Semester:');
    console.log('  Semester 1: Engineering Math I, Physics, Programming in C, Graphics, Electronics');
    console.log('  Semester 2: Engineering Math II, Data Structures, Digital Electronics, OOP, Computer Org\n');
    
    console.log('📈 Expected Dashboard Stats:');
    console.log('  Overall Attendance: ~85%');
    console.log('  Total Students: 80');
    console.log('  Total Classes: ~55 per subject');
    console.log('  Active Subjects: 10');
    console.log('  Defaulters (<75%): ~5-10 students\n');
    
    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    mongoose.connection.close();
  }
}

seedComputerEngineering();
