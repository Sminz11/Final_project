
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { RequestService, RequestItem } from '../../services/request.service';

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './create-request.component.html',
  styleUrls: ['./create-request.component.css']
})
export class CreateRequestComponent implements OnInit {
  title = '';
  requestType = 'DATABASE';
  targetSystem = '';
  reason = '';
  isSubmitting = false;
  currentUser: any = null;

  // โหมดแก้ไข
  editMode = false;
  requestId: number | null = null;
  loadingRequest = false;

  constructor(
    private requestService: RequestService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      this.currentUser = user;
    });

    this.route.queryParamMap.pipe(take(1)).subscribe(params => {
      const idParam = params.get('id');

      if (idParam === null) {
        return; // สร้างคำขอใหม่
      }

      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        Swal.fire('ไม่พบคำขอ', 'รหัสคำขอไม่ถูกต้อง', 'error')
          .then(() => this.router.navigate(['/dashboard']));
        return;
      }

      this.editMode = true;
      this.requestId = id;
      this.loadDraft(id);
    });
  }

  private loadDraft(id: number): void {
    this.loadingRequest = true;

    this.requestService.getRequestById(id).subscribe({
      next: (request: RequestItem) => {
        // ตรวจซ้ำที่ UI เพื่อไม่ให้เปิดฟอร์มแก้ไขสถานะอื่น
        if (request.status !== 'DRAFT') {
          Swal.fire(
            'แก้ไขไม่ได้',
            'สามารถแก้ไขได้เฉพาะคำขอที่มีสถานะ DRAFT เท่านั้น',
            'warning'
          ).then(() => this.router.navigate(['/dashboard']));
          return;
        }

        this.title = request.title || '';
        this.requestType = request.request_type || 'DATABASE';
        this.targetSystem = request.target_system || '';
        this.reason = request.reason || '';
      },
      error: err => {
        console.error('Load draft error:', err);

        Swal.fire(
          'โหลดข้อมูลไม่สำเร็จ',
          err.error?.error || 'ไม่สามารถโหลดคำขอได้',
          'error'
        ).then(() => this.router.navigate(['/dashboard']));
      },
      complete: () => {
        this.loadingRequest = false;
      }
    });
  }

  onSubmit(): void {
    if (this.isSubmitting || this.loadingRequest) {
      return;
    }

    if (
      !this.title.trim() ||
      !this.requestType ||
      !this.targetSystem.trim() ||
      !this.reason.trim()
    ) {
      Swal.fire({
        title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        text: 'โปรดระบุหัวข้อ ประเภท ระบบเป้าหมาย และเหตุผล',
        icon: 'warning',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#00a3e0'
      });
      return;
    }

    Swal.fire({
      title: this.editMode ? 'ยืนยันการแก้ไขคำขอ?' : 'ยืนยันการบันทึกคำขอ?',
      text: this.editMode
        ? 'ต้องการบันทึกข้อมูลที่แก้ไขใช่หรือไม่'
        : 'ต้องการสร้างคำขอสิทธิ์นี้ใช่หรือไม่',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: this.editMode ? 'บันทึกการแก้ไข' : 'บันทึกคำขอ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#00a3e0',
      cancelButtonColor: '#94a3b8',
      reverseButtons: true
    }).then(result => {
      if (result.isConfirmed) {
        this.executeSave();
      }
    });
  }

  private executeSave(): void {
    this.isSubmitting = true;

    const payload = {
      title: this.title.trim(),
      request_type: this.requestType,
      target_system: this.targetSystem.trim(),
      reason: this.reason.trim()
    };

    const request$ =
      this.editMode && this.requestId !== null
        ? this.requestService.updateDraft(this.requestId, payload)
        : this.requestService.createRequest(payload);

    request$.subscribe({
      next: () => {
        this.isSubmitting = false;

        Swal.fire({
          title: this.editMode ? 'แก้ไขคำขอสำเร็จ!' : 'บันทึกคำขอสำเร็จ!',
          text: this.editMode
            ? 'ข้อมูลคำขอได้รับการแก้ไขแล้ว'
            : 'สร้างคำขอใหม่เรียบร้อยแล้ว',
          icon: 'success',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#00a3e0'
        }).then(() => {
          this.router.navigate(['/dashboard']);
        });
      },
      error: err => {
        this.isSubmitting = false;
        console.error('Save Request Error:', err);

        Swal.fire({
          title: 'บันทึกไม่สำเร็จ',
          text:
            err.error?.error ||
            err.error?.message ||
            'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่',
          icon: 'error',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#ef4444'
        });
      }
    });
  }
}
