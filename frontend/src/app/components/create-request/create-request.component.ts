import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import Swal from 'sweetalert2'; // Import SweetAlert2

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HttpClientModule
  ],
  templateUrl: './create-request.component.html',
  styleUrls: ['./create-request.component.css']
})
export class CreateRequestComponent {
  title: string = '';
  requestType: string = 'DATABASE';
  targetSystem: string = '';
  reason: string = '';
  isSubmitting: boolean = false;

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router
  ) {}

  onSubmit() {
    // 1. ตรวจสอบข้อมูลว่างเปล่า (แจ้งเตือนด้วย SweetAlert2)
    if (!this.title.trim() || !this.targetSystem.trim() || !this.reason.trim()) {
      Swal.fire({
        title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        text: 'โปรดระบุหัวข้อคำขอ ระบบเป้าหมาย และเหตุผลความจำเป็น',
        icon: 'warning',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#00a3e0',
        customClass: {
          popup: 'swal-ktb-popup'
        }
      });
      return;
    }

    // 2. ถามยืนยันก่อนทำการบันทึก
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
      customClass: {
        popup: 'swal-ktb-popup'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeSave();
      }
    });
  }

  // แยก Logic การส่ง API ออกมาทำหลังจากกดยืนยัน
  private executeSave() {
    this.isSubmitting = true;

    this.auth.getAccessTokenSilently().subscribe({
      next: (token) => {
        const headers = new HttpHeaders({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        });

        const payload = {
          title: this.title,
          request_type: this.requestType,
          target_system: this.targetSystem,
          reason: this.reason
        };

        // แก้ไข URL เติม /v1 ให้ตรงกับ Go Backend
        this.http.post('http://localhost:8080/api/v1/requests', payload, { headers }).subscribe({
          next: () => {
            this.isSubmitting = false;

            // แสดง Pop-up สำเร็จก่อนพาไปหน้า Dashboard
            Swal.fire({
              title: 'บันทึกคำขอสำเร็จ!',
              text: 'รายการคำขอของคุณถูกสร้างเรียบร้อยแล้ว',
              icon: 'success',
              confirmButtonText: 'ตกลง',
              confirmButtonColor: '#00a3e0',
              customClass: {
                popup: 'swal-ktb-popup'
              }
            }).then(() => {
              this.router.navigate(['/dashboard']);
            });
          },
          error: (err) => {
            console.error('API Error:', err);
            this.isSubmitting = false;

            Swal.fire({
              title: 'เกิดข้อผิดพลาดในการบันทึก',
              text: err.error?.error || err.error?.message || err.statusText || 'เซิร์ฟเวอร์ขัดข้อง ไม่สามารถบันทึกข้อมูลได้',
              icon: 'error',
              confirmButtonText: 'ตกลง',
              confirmButtonColor: '#00a3e0',
              customClass: {
                popup: 'swal-ktb-popup'
              }
            });
          }
        });
      },
      error: (err) => {
        console.error('Token Error:', err);
        this.isSubmitting = false;

        Swal.fire({
          title: 'ยืนยันตัวตนไม่สำเร็จ',
          text: 'ไม่สามารถยืนยันตัวตนได้ กรุณาล็อกอินใหม่อีกครั้ง',
          icon: 'error',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#00a3e0',
          customClass: {
            popup: 'swal-ktb-popup'
          }
        });
      }
    });
  }
}