import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular'; // 1. Import AuthService เพิ่มเติม
import Swal from 'sweetalert2';
import { RequestService } from '../../services/request.service';

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
  ],
  templateUrl: './create-request.component.html',
  styleUrls: ['./create-request.component.css']
})
export class CreateRequestComponent implements OnInit {
  title: string = '';
  requestType: string = 'DATABASE';
  targetSystem: string = '';
  reason: string = '';
  isSubmitting: boolean = false;
  
  currentUser: any = null; // เก็บข้อมูล User ปัจจุบัน

  constructor(
    private requestService: RequestService,
    private auth: AuthService, // 2. Inject AuthService เข้ามาใน constructor
    private router: Router
  ) {}

  ngOnInit(): void {
    // 3. ดึงข้อมูล User Profile ของคนที่ล็อกอินอยู่จริง ณ ปัจจุบัน
    this.auth.user$.subscribe((user) => {
      this.currentUser = user;
    });
  }

  onSubmit(): void {
    if (!this.title.trim() || !this.targetSystem.trim() || !this.reason.trim()) {
      Swal.fire({
        title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        text: 'โปรดระบุหัวข้อคำขอ ระบบเป้าหมาย และเหตุผลความจำเป็น',
        icon: 'warning',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#00a3e0',
        customClass: { popup: 'swal-ktb-popup' }
      });
      return;
    }

    Swal.fire({
      title: 'ยืนยันการบันทึกคำขอ?',
      text: 'คุณต้องการบันทึกคำขอสิทธิ์นี้เข้าสู่ระบบใช่หรือไม่',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการบันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#00a3e0',
      cancelButtonColor: '#94a3b8',
      reverseButtons: true,
      customClass: { popup: 'swal-ktb-popup' }
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeSave();
      }
    });
  }

  private executeSave(): void {
    this.isSubmitting = true;

    // 4. แนบ email และ auth_id ของผู้ใช้ปัจจุบันเข้าไปใน payload
    const payload = {
      title: this.title.trim(),
      request_type: this.requestType,
      target_system: this.targetSystem.trim(),
      reason: this.reason.trim(),
      email: this.currentUser?.email,
      auth_id: this.currentUser?.sub
    };

    this.requestService.createRequest(payload).subscribe({
      next: () => {
        this.isSubmitting = false;
        Swal.fire({
          title: 'บันทึกคำขอสำเร็จ!',
          text: 'รายการคำขอของคุณถูกสร้างเรียบร้อยแล้ว',
          icon: 'success',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#00a3e0',
          customClass: { popup: 'swal-ktb-popup' }
        }).then(() => {
          this.router.navigate(['/dashboard']);
        });
      },
      error: (err: any) => {
        console.error('Create Request Error:', err);
        this.isSubmitting = false;
        Swal.fire({
          title: 'เกิดข้อผิดพลาดในการบันทึก',
          text: err.error?.error || err.error?.message || err.statusText || 'เซิร์ฟเวอร์ขัดข้อง ไม่สามารถบันทึกข้อมูลได้',
          icon: 'error',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#00a3e0',
          customClass: { popup: 'swal-ktb-popup' }
        });
      }
    });
  }
}