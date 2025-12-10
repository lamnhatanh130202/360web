# ⚡ HƯỚNG DẪN DEPLOY NHANH

Hướng dẫn nhanh để deploy ứng dụng lên server.

---

## 📋 CHUẨN BỊ

### 1. Clone code từ GitHub

```bash
git clone https://github.com/your-username/360web.git
cd 360web
```

### 2. Copy file cấu hình

```bash
# Copy file .env.example thành .env
cp .env.example .env

# Chỉnh sửa .env nếu cần (đặc biệt là AUTH_SECRET_KEY, ADMIN_PASSWORD)
nano .env
```

### 3. Đảm bảo có các file cần thiết

- ✅ `backend/keys/google-tts-key.json` (nếu dùng TTS)
- ✅ `cms/data/scenes.json`
- ✅ `cms/data/tours.json`
- ✅ `cms/data/graph.json`

---

## 🚀 DEPLOY (3 BƯỚC)

### Cách 1: Dùng Script (Khuyến nghị)

**Windows:**
```powershell
.\build.ps1
.\deploy.ps1
```

**Linux/Mac:**
```bash
chmod +x build.sh deploy.sh
./build.sh
./deploy.sh
```

### Cách 2: Deploy thủ công

**Bước 1: Build Frontend và CMS**
```bash
# Windows
.\build.ps1

# Linux/Mac
./build.sh
```

**Bước 2: Build và chạy Docker**
```bash
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

**Bước 3: Kiểm tra**
```bash
# Xem logs
docker-compose -f docker-compose.prod.yml logs -f

# Xem status
docker-compose -f docker-compose.prod.yml ps
```

---

## 🌐 TRUY CẬP

Sau khi deploy thành công:

- **Frontend**: http://localhost:8080 (hoặc port trong .env)
- **Backend API**: http://localhost:5000
- **CMS Admin**: http://localhost:8080/cms

---

## 🔧 CÁC LỆNH HỮU ÍCH

```bash
# Xem logs
docker-compose -f docker-compose.prod.yml logs -f

# Xem logs của service cụ thể
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend

# Restart service
docker-compose -f docker-compose.prod.yml restart backend

# Stop tất cả
docker-compose -f docker-compose.prod.yml down

# Stop và xóa volumes
docker-compose -f docker-compose.prod.yml down -v

# Rebuild và restart
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 🔒 BẢO MẬT

### 1. Thay đổi mật khẩu mặc định

Sửa file `.env`:
```env
AUTH_SECRET_KEY=your_random_secret_key_here
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_strong_password
```

### 2. Setup Nginx Reverse Proxy (Tùy chọn)

Xem hướng dẫn chi tiết trong `DEPLOYMENT.md`

### 3. Setup SSL/HTTPS

Sử dụng Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🐛 XỬ LÝ LỖI

### Lỗi: Build failed

```bash
# Xem logs chi tiết
docker-compose -f docker-compose.prod.yml logs backend

# Rebuild không cache
docker-compose -f docker-compose.prod.yml build --no-cache
```

### Lỗi: Port đã được sử dụng

Sửa port trong file `.env`:
```env
BACKEND_PORT=5001
FRONTEND_PORT=8081
```

### Lỗi: Permission denied

```bash
# Linux/Mac: Thêm quyền execute
chmod +x build.sh deploy.sh

# Kiểm tra quyền file
ls -la
```

---

## 📝 UPDATE CODE

Khi có code mới từ GitHub:

```bash
# Pull code mới
git pull

# Rebuild và restart
.\build.ps1  # Windows
./build.sh   # Linux/Mac
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## ✅ CHECKLIST

- [ ] Đã clone code từ GitHub
- [ ] Đã copy `.env.example` thành `.env`
- [ ] Đã thay đổi `AUTH_SECRET_KEY` và `ADMIN_PASSWORD`
- [ ] Đã có file `google-tts-key.json` (nếu cần)
- [ ] Đã build frontend và CMS
- [ ] Đã chạy `docker-compose up -d`
- [ ] Đã kiểm tra logs không có lỗi
- [ ] Đã truy cập được frontend và CMS

---

**Xem `DEPLOYMENT.md` để biết hướng dẫn chi tiết hơn!**

