import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { RequestService, RequestItem } from '../services/request.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  myRequests: RequestItem[] = [];
  filteredRequests: RequestItem[] = [];
  searchTerm: string = '';
  selectedStatus: string = 'ALL';
  loadingRequests: boolean = false;

  // Modal Detail State
  selectedDetail: RequestItem | null = null;
  showDetailModal: boolean = false;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 5;
  Math = Math;

  constructor(
    private requestService: RequestService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.auth.isAuthenticated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAuthenticated: boolean) => {
        if (isAuthenticated) {
          this.loadMyRequests();
        }
      });
  }

  login(): void {
    this.auth.loginWithRedirect();
  }

  loadMyRequests(): void {
    this.loadingRequests = true;

    this.requestService.getMyRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: RequestItem[]) => {
          this.myRequests = (data || []).map((item: RequestItem) => {
            const raw = item as Record<string, any>;
            return {
              ...item,
              req_code: item.req_code || raw['reqCode'] || String(item.id),
              request_type: item.request_type || raw['requestType'],
              target_system: item.target_system || raw['targetSystem'],
              status: item.status || 'DRAFT'
            };
          });

          this.applyFilter();
          this.loadingRequests = false;
        },
        error: (err: unknown) => {
          console.error('Fetch requests error:', err);
          this.loadingRequests = false;
        }
      });
  }

  applyFilter(): void {
    const term = (this.searchTerm || '').trim().toLowerCase();

    this.filteredRequests = this.myRequests.filter((req: RequestItem) => {
      const matchSearch = !term ||
        (req.req_code && String(req.req_code).toLowerCase().includes(term)) ||
        (req.title && String(req.title).toLowerCase().includes(term)) ||
        (req.target_system && String(req.target_system).toLowerCase().includes(term));

      const matchStatus = this.selectedStatus === 'ALL' || req.status === this.selectedStatus;

      return matchSearch && matchStatus;
    });

    this.currentPage = 1;
  }

  openDetailModal(item: RequestItem): void {
    this.selectedDetail = item;
    this.showDetailModal = true;
  }

  closeDetailModal(): void {
    this.showDetailModal = false;
    this.selectedDetail = null;
  }

  get pagedRequests(): RequestItem[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredRequests.slice(startIndex, startIndex + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredRequests.length / this.pageSize) || 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getStatusStyle(status: string): { [key: string]: string } {
    switch (status) {
      case 'DRAFT': return { 'background-color': '#f1f5f9', 'color': '#475569' };
      case 'SUBMITTED': return { 'background-color': '#e0f2fe', 'color': '#0288d1' };
      case 'APPROVED': return { 'background-color': '#dcfce7', 'color': '#15803d' };
      case 'REJECTED': return { 'background-color': '#fee2e2', 'color': '#b91c1c' };
      default: return { 'background-color': '#f1f5f9', 'color': '#475569' };
    }
  }

  submitRequest(requestId: number): void {
    Swal.fire({
      title: 'ยืนยันการส่งคำขอ?',
      text: 'คุณต้องการส่งคำขอนี้เพื่อขออนุมัติใช่หรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#00a3e0',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'ใช่, ส่งคำขอเลย!',
      cancelButtonText: 'ยกเลิก',
      customClass: { popup: 'swal-ktb-popup' }
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeSubmit(requestId);
      }
    });
  }

  private executeSubmit(requestId: number): void {
    this.requestService.submitRequest(requestId).subscribe({
      next: () => {
        Swal.fire({
          title: 'ส่งคำขอสำเร็จ!',
          text: 'รายการคำขอของคุณถูกส่งไปยังผู้อนุมัติเรียบร้อยแล้ว',
          icon: 'success',
          confirmButtonColor: '#00a3e0',
          confirmButtonText: 'ตกลง',
          customClass: { popup: 'swal-ktb-popup' }
        });
        this.loadMyRequests();
      },
      error: (err: any) => {
        console.error('Submit error:', err);
        Swal.fire({
          title: 'เกิดข้อผิดพลาด!',
          text: err.error?.error || err.error?.message || 'ไม่สามารถส่งคำขอได้ กรุณาลองใหม่อีกครั้ง',
          icon: 'error',
          confirmButtonColor: '#ef4444',
          customClass: { popup: 'swal-ktb-popup' }
        });
      }
    });
  }
}