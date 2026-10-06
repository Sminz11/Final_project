package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type CustomClaims struct {
	Email       string      `json:"email"`
	Auth0Email  string      `json:"https://example.com/email"`
	Permissions []string    `json:"permissions"`
	Roles       interface{} `json:"roles"`
	jwt.RegisteredClaims
}

var jwks *keyfunc.JWKS

func InitJWKS(auth0Domain string) {
	domain := strings.TrimPrefix(auth0Domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")

	jwksURL := fmt.Sprintf("https://%s/.well-known/jwks.json", domain)
	options := keyfunc.Options{
		RefreshInterval: time.Hour,
	}

	var err error
	jwks, err = keyfunc.Get(jwksURL, options)
	if err != nil {
		fmt.Printf("❌ Error getting JWKS from Auth0 (%s): %v\n", jwksURL, err)
	} else {
		fmt.Println("✅ Successfully fetched JWKS from Auth0")
	}
}

func ValidateJWT(auth0Domain string, apiAudience string) gin.HandlerFunc {
	domain := strings.TrimPrefix(auth0Domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	expectedIssuer := fmt.Sprintf("https://%s/", domain)

	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Missing or invalid token"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Parse token เป็น Map เพื่ออ่าน Claims ทุกรูปแบบที่ Auth0 ส่งมา
		tokenMap := make(jwt.MapClaims)
		parseOptions := []jwt.ParserOption{
			jwt.WithIssuer(expectedIssuer),
			jwt.WithAudience(apiAudience),
		}

		var token *jwt.Token
		var err error

		if jwks != nil {
			token, err = jwt.ParseWithClaims(tokenString, tokenMap, jwks.Keyfunc, parseOptions...)
		} else {
			token, _, err = jwt.NewParser(parseOptions...).ParseUnverified(tokenString, tokenMap)
		}

		if err != nil || !token.Valid {
			fmt.Printf("⚠️ JWT Validation Error: %v\n", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Invalid or expired token"})
			c.Abort()
			return
		}

		// 1. ดึง Email จาก Token Map ก่อน
		userEmail := ""
		if email, ok := tokenMap["email"].(string); ok {
			userEmail = email
		} else {
			for k, v := range tokenMap {
				if strings.HasSuffix(k, "/email") {
					if emailStr, ok := v.(string); ok {
						userEmail = emailStr
						break
					}
				}
			}
		}

		// Fallback: หากใน JWT ไม่แนบ Email Claim มา ให้ใช้ X-User-Email จาก Header สำรอง
		if userEmail == "" {
			userEmail = c.GetHeader("X-User-Email")
		}

		// 2. แกะข้อมูล Roles และ Permissions จาก Token Map
		var extractedRoles []string
		var extractedPermissions []string

		if perms, ok := tokenMap["permissions"].([]interface{}); ok {
			for _, p := range perms {
				if pStr, ok := p.(string); ok {
					extractedPermissions = append(extractedPermissions, pStr)
				}
			}
		}

		for k, v := range tokenMap {
			if k == "roles" || strings.HasSuffix(k, "/roles") {
				if rolesList, ok := v.([]interface{}); ok {
					for _, r := range rolesList {
						if rStr, ok := r.(string); ok {
							extractedRoles = append(extractedRoles, rStr)
						}
					}
				}
			}
		}

		sub, _ := tokenMap["sub"].(string)

		c.Set("user", token)
		c.Set("user_id", sub)
		c.Set("user_email", userEmail)
		c.Set("roles", extractedRoles)
		c.Set("permissions", extractedPermissions)

		c.Next()
	}
}

func RequirePermission(allowedPermissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		permsVal, exists := c.Get("permissions")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden: No permissions found"})
			c.Abort()
			return
		}

		userPerms, ok := permsVal.([]string)
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden: Invalid permissions format"})
			c.Abort()
			return
		}

		for _, userPerm := range userPerms {
			for _, allowedPerm := range allowedPermissions {
				if userPerm == allowedPerm {
					c.Next()
					return
				}
			}
		}

		c.JSON(http.StatusForbidden, gin.H{
			"error": "Forbidden: You do not have permission to perform this action",
		})
		c.Abort()
	}
}
