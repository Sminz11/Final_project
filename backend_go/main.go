package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"intern-backend/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Request struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	ReqCode        string     `gorm:"uniqueIndex;not null" json:"req_code"`
	UserID         string     `gorm:"not null;index" json:"user_id"`
	RequesterEmail string     `json:"requester_email"`
	Title          string     `gorm:"not null" json:"title"`
	RequestType    string     `gorm:"not null" json:"request_type"`
	TargetSystem   string     `gorm:"not null" json:"target_system"`
	Reason         string     `gorm:"not null" json:"reason"`
	Status         string     `gorm:"default:'DRAFT'" json:"status"`
	ApprovedBySub  string     `json:"approved_by_sub,omitempty"`
	RejectReason   string     `json:"reject_reason,omitempty"`
	SubmittedAt    *time.Time `json:"submitted_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type AuditLog struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ActorSub        string    `gorm:"not null" json:"actor_sub"`
	ActorEmail      string    `json:"actor_email"`
	Action          string    `gorm:"not null" json:"action"`
	TargetRequestID uint      `gorm:"not null" json:"target_request_id"`
	Details         string    `json:"details"`
	CreatedAt       time.Time `json:"created_at"`
}

type CreateRequestInput struct {
	Title        string `json:"title" binding:"required"`
	RequestType  string `json:"request_type" binding:"required"`
	TargetSystem string `json:"target_system" binding:"required"`
	Reason       string `json:"reason" binding:"required"`
}

type UpdateRequestInput struct {
	Title        string `json:"title"`
	RequestType  string `json:"request_type"`
	TargetSystem string `json:"target_system"`
	Reason       string `json:"reason"`
}

type RejectInput struct {
	RejectReason string `json:"reject_reason" binding:"required"`
}

var DB *gorm.DB

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func initDB() {
	dsn := getEnv("DATABASE_URL", "host=localhost user=postgres password=1234 dbname=final_db port=1234 sslmode=disable TimeZone=Asia/Bangkok")
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("ไม่สามารถเชื่อมต่อ PostgreSQL ได้: %v", err)
	}
	database.AutoMigrate(&Request{}, &AuditLog{})
	DB = database
	log.Println("เชื่อมต่อ PostgreSQL เรียบร้อยแล้ว!")
}

func getUserEmail(c *gin.Context) string {
	if emailVal, ok := c.Get("user_email"); ok {
		if emailStr, ok := emailVal.(string); ok {
			return emailStr
		}
	}
	return ""
}

func logAudit(actorSub string, actorEmail string, action string, requestID uint, details string) {
	DB.Create(&AuditLog{
		ActorSub:        actorSub,
		ActorEmail:      actorEmail,
		Action:          action,
		TargetRequestID: requestID,
		Details:         details,
		CreatedAt:       time.Now(),
	})
}

// Authorization Helper Functions
func hasRole(c *gin.Context, targetRoles ...string) bool {
	if rolesVal, ok := c.Get("roles"); ok {
		if roles, ok := rolesVal.([]string); ok {
			for _, userRole := range roles {
				for _, target := range targetRoles {
					if strings.EqualFold(userRole, target) {
						return true
					}
				}
			}
		}
	}
	return false
}

func hasPermission(c *gin.Context, targetPerms ...string) bool {
	if permsVal, ok := c.Get("permissions"); ok {
		if perms, ok := permsVal.([]string); ok {
			for _, userPerm := range perms {
				for _, target := range targetPerms {
					if userPerm == target {
						return true
					}
				}
			}
		}
	}
	return false
}

func isAdmin(c *gin.Context) bool {
	// 1. เช็คจาก Roles / Permissions ใน Token
	if hasRole(c, "Admin", "REQUEST_ADMIN", "ADMIN") || hasPermission(c, "read:admin_data", "admin:all") {
		return true
	}

	// 2. เช็คจาก Email
	email := strings.ToLower(getUserEmail(c))
	if email != "" && (strings.HasPrefix(email, "admin") || strings.Contains(email, "admin@")) {
		return true
	}

	// 3. เช็คจาก Sub (User ID Claim)
	subVal, _ := c.Get("user_id")
	if sub, ok := subVal.(string); ok {
		subLower := strings.ToLower(sub)
		if strings.Contains(subLower, "admin") {
			return true
		}
	}

	return false
}

func isApprover(c *gin.Context) bool {
	// 1. เช็คจาก Roles / Permissions ใน Token หรือเป็น Admin
	if hasRole(c, "Approver", "REQUEST_APPROVER", "APPROVER") || hasPermission(c, "approve:requests", "read:pending_requests") || isAdmin(c) {
		return true
	}

	// 2. เช็คจาก Email
	email := strings.ToLower(getUserEmail(c))
	if email != "" && (strings.HasPrefix(email, "approver") || strings.Contains(email, "approver@")) {
		return true
	}

	// 3. เช็คจาก Sub (User ID Claim)
	subVal, _ := c.Get("user_id")
	if sub, ok := subVal.(string); ok {
		subLower := strings.ToLower(sub)
		if strings.Contains(subLower, "approver") {
			return true
		}
	}

	return false
}

// Handlers

func getProfileHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	userEmail := getUserEmail(c)

	c.JSON(http.StatusOK, gin.H{
		"user_id": userID,
		"email":   userEmail,
	})
}

func createRequestHandler(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งานจาก Token"})
		return
	}
	userID := userIDVal.(string)
	userEmail := getUserEmail(c)

	var input CreateRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือกรอกข้อมูลไม่ครบถ้วน"})
		return
	}

	var count int64
	DB.Model(&Request{}).Count(&count)

	newReq := Request{
		ReqCode:        fmt.Sprintf("REQ-2026-%06d", count+1),
		UserID:         userID,
		RequesterEmail: userEmail,
		Title:          input.Title,
		RequestType:    input.RequestType,
		TargetSystem:   input.TargetSystem,
		Reason:         input.Reason,
		Status:         "DRAFT",
	}

	if err := DB.Create(&newReq).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้"})
		return
	}

	logAudit(userID, userEmail, "CREATE_DRAFT", newReq.ID, fmt.Sprintf("Created draft request %s", newReq.ReqCode))
	c.JSON(http.StatusCreated, newReq)
}

func getRequestByIDHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.UserID != userID && !isApprover(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงรายการคำขอนี้"})
		return
	}

	c.JSON(http.StatusOK, req)
}

func updateDraftHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์แก้ไขคำขอของผู้อื่น"})
		return
	}
	if req.Status != "DRAFT" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "แก้ไขได้เฉพาะคำขอที่เป็น DRAFT เท่านั้น"})
		return
	}

	var input UpdateRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	if input.Title != "" {
		req.Title = input.Title
	}
	if input.RequestType != "" {
		req.RequestType = input.RequestType
	}
	if input.TargetSystem != "" {
		req.TargetSystem = input.TargetSystem
	}
	if input.Reason != "" {
		req.Reason = input.Reason
	}

	userEmail := getUserEmail(c)
	if userEmail != "" {
		req.RequesterEmail = userEmail
	}

	DB.Save(&req)
	logAudit(userID, userEmail, "UPDATE_DRAFT", req.ID, fmt.Sprintf("Updated draft request %s", req.ReqCode))
	c.JSON(http.StatusOK, req)
}

func submitRequestHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	userEmail := getUserEmail(c)
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์ Submit คำขอของผู้อื่น"})
		return
	}
	if req.Status != "DRAFT" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "คำขอนี้ไม่ได้อยู่ในสถานะ DRAFT"})
		return
	}

	now := time.Now()
	req.Status = "SUBMITTED"
	req.SubmittedAt = &now
	if userEmail != "" {
		req.RequesterEmail = userEmail
	}
	DB.Save(&req)

	logAudit(userID, userEmail, "SUBMIT", req.ID, fmt.Sprintf("Submitted request %s", req.ReqCode))
	c.JSON(http.StatusOK, req)
}

func getMyRequestsHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	var requests []Request
	DB.Where("user_id = ?", userID).Order("created_at desc").Find(&requests)

	c.JSON(http.StatusOK, requests)
}

func getPendingRequestsHandler(c *gin.Context) {
	if !isApprover(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงรายการรออนุมัติ"})
		return
	}

	var requests []Request
	DB.Where("status = ?", "SUBMITTED").Order("created_at desc").Find(&requests)

	c.JSON(http.StatusOK, requests)
}

func approveRequestHandler(c *gin.Context) {
	if !isApprover(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์อนุมัติรายการคำขอ"})
		return
	}

	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	userEmail := getUserEmail(c)
	id := c.Param("id")

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.Status != "SUBMITTED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "อนุมัติได้เฉพาะคำขอที่อยู่ในสถานะ SUBMITTED"})
		return
	}

	req.Status = "APPROVED"
	req.ApprovedBySub = userID
	DB.Save(&req)

	logAudit(userID, userEmail, "APPROVE", req.ID, fmt.Sprintf("Approved request %s", req.ReqCode))
	c.JSON(http.StatusOK, req)
}

func rejectRequestHandler(c *gin.Context) {
	if !isApprover(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์ปฏิเสธรายการคำขอ"})
		return
	}

	userIDVal, _ := c.Get("user_id")
	userID, _ := userIDVal.(string)
	userEmail := getUserEmail(c)
	id := c.Param("id")

	var input RejectInput
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.RejectReason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reject_reason is required"})
		return
	}

	var req Request
	if err := DB.First(&req, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการคำขอ"})
		return
	}

	if req.Status != "SUBMITTED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ปฏิเสธได้เฉพาะคำขอที่อยู่ในสถานะ SUBMITTED"})
		return
	}

	req.Status = "REJECTED"
	req.RejectReason = input.RejectReason
	req.ApprovedBySub = userID
	DB.Save(&req)

	logAudit(userID, userEmail, "REJECT", req.ID, fmt.Sprintf("Rejected request %s: %s", req.ReqCode, input.RejectReason))
	c.JSON(http.StatusOK, req)
}

func getAllRequestsAdminHandler(c *gin.Context) {
	if !isAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ดูแลระบบ"})
		return
	}

	var requests []Request
	DB.Order("created_at desc").Find(&requests)

	c.JSON(http.StatusOK, requests)
}

func getAuditLogsHandler(c *gin.Context) {
	if !isAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึง Audit Logs"})
		return
	}

	var logs []AuditLog
	DB.Order("created_at desc").Find(&logs)

	c.JSON(http.StatusOK, logs)
}

func main() {
	initDB()

	auth0Domain := getEnv("AUTH0_DOMAIN", "dev-if4shgdd8fo8fttw.us.auth0.com")
	apiAudience := getEnv("AUTH0_AUDIENCE", "https://intern-request-api")

	middleware.InitJWKS(auth0Domain)

	r := gin.Default()

	// CORS Middleware - ปรับแก้เพื่อปลดล็อก Preflight Block สำหรับ X-User-Email
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:4200")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-User-Email, x-user-email, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	v1 := r.Group("/api/v1")
	v1.Use(middleware.ValidateJWT(auth0Domain, apiAudience))
	{
		v1.GET("/profile", getProfileHandler)

		v1.GET("/requests", getMyRequestsHandler)
		v1.GET("/requests/:id", getRequestByIDHandler)
		v1.POST("/requests", createRequestHandler)
		v1.PUT("/requests/:id", updateDraftHandler)
		v1.POST("/requests/:id/submit", submitRequestHandler)

		v1.GET("/approvals/pending", getPendingRequestsHandler)
		v1.POST("/requests/:id/approve", approveRequestHandler)
		v1.POST("/requests/:id/reject", rejectRequestHandler)

		v1.GET("/admin/requests", getAllRequestsAdminHandler)
		v1.GET("/admin/audit-logs", getAuditLogsHandler)
		v1.GET("/admin/audit-log", getAuditLogsHandler)
	}

	port := getEnv("PORT", "8080")
	log.Printf("Backend Server running on port %s\n", port)
	r.Run(":" + port)
}
