# 🚀 HƯỚNG DẪN CHẠY ỨNG DỤNG 360 WEB

Hướng dẫn chi tiết để chạy ứng dụng 360 Virtual Tour với Backend Flask, Frontend React và CMS.

---

## 📋 YÊU CẦU HỆ THỐNG

### Phần mềm cần cài đặt:

1. **Docker & Docker Compose**
   - Docker Desktop (Windows/Mac) hoặc Docker Engine (Linux)
   - Docker Compose v2.0+
   - [Download Docker](https://www.docker.com/products/docker-desktop)

2. **Node.js & pnpm** (nếu chạy development mode không dùng Docker)
   - Node.js 18+ 
   - pnpm: `npm install -g pnpm`

3. **Python 3.11+** (nếu chạy backend local không dùng Docker)
   - Python 3.11 hoặc cao hơn
   - pip

### File cấu hình cần có:

- `backend/keys/google-tts-key.json` - Google Cloud TTS credentials (nếu sử dụng tính năng TTS)

---

## 🐳 CÁCH 1: CHẠY BẰNG DOCKER COMPOSE (KHUYẾN NGHỊ)

Cách đơn giản nhất để chạy toàn bộ ứng dụng.

### Bước 1: Chuẩn bị môi trường

```bash
# Đảm bảo Docker đang chạy
docker --version
docker-compose --version
```

### Bước 2: Build và chạy services

```bash
# Từ thư mục gốc của project
cd d:\website\360web

# Build và chạy tất cả services
docker-compose up --build

# Hoặc chạy ở background
docker-compose up -d --build
```

### Bước 3: Truy cập ứng dụng

- **Frontend (Viewer)**: http://localhost:8080
- **Backend API**: http://localhost:5000
- **CMS Admin**: http://localhost:8080/cms (sau khi build frontend)

### Các lệnh Docker Compose hữu ích:

```bash
# Xem logs
docker-compose logs -f

# Xem logs của service cụ thể
docker-compose logs -f backend
docker-compose logs -f frontend

# Dừng services
docker-compose down

# Dừng và xóa volumes
docker-compose down -v

# Rebuild lại một service
docker-compose up --build backend

# Restart một service
docker-compose restart backend
```

### Hot Reload trong Docker

Backend đã được cấu hình để tự động reload khi code thay đổi (development mode):
- Sửa code trong `backend/` → Flask tự động reload
- Không cần restart container

---

## 💻 CÁCH 2: CHẠY DEVELOPMENT MODE (KHÔNG DOCKER)

Chạy từng service riêng lẻ để development dễ dàng hơn.

### 2.1. Chạy Backend (Flask)

```bash
# Di chuyển vào thư mục backend
cd backend

# Tạo virtual environment (nếu chưa có)
python -m venv venv

# Kích hoạt virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows CMD:
.\venv\Scripts\activate.bat
# Linux/Mac:
source venv/bin/activate

# Cài đặt dependencies
pip install -r requirements.txt

# Chạy Flask server (development mode với hot reload)
python app.py

# Hoặc sử dụng Flask CLI
flask run --host=0.0.0.0 --port=5000 --debug
```

Backend sẽ chạy tại: **http://localhost:5000**

### 2.2. Chạy Frontend (Viewer)

```bash
# Di chuyển vào thư mục frontend
cd frontend

# Cài đặt dependencies (nếu chưa có)
pnpm install
# hoặc
npm install

# Chạy development server
pnpm dev
# hoặc
npm run dev
```

Frontend sẽ chạy tại: **http://localhost:3000** (hoặc port khác nếu 3000 đã được dùng)

### 2.3. Chạy CMS Frontend

```bash
# Di chuyển vào thư mục cms-frontend
cd cms-frontend

# Cài đặt dependencies (nếu chưa có)
pnpm install
# hoặc
npm install

# Chạy development server
pnpm dev
# hoặc
npm run dev
```

CMS sẽ chạy tại: **http://localhost:3000** (hoặc port khác)

**Lưu ý**: Nếu cả frontend và cms-frontend cùng chạy, chúng sẽ tự động chọn port khác nhau.

---

## 🏗️ BUILD PRODUCTION

### Build Frontend và CMS

```bash
# Build Frontend
cd frontend
pnpm build
# Output: frontend/dist/

# Build CMS Frontend
cd cms-frontend
pnpm build
# Output: cms-frontend/dist/
```

### Build Docker Images

```bash
# Build tất cả images
docker-compose build

# Build một service cụ thể
docker-compose build backend
docker-compose build frontend
```

---

## 🔧 CẤU HÌNH MÔI TRƯỜNG

### Environment Variables

#### Backend (docker-compose.yml):

```yaml
environment:
  - FLASK_ENV=development        # development hoặc production
  - FLASK_DEBUG=1                # 1 để bật debug, 0 để tắt
  - GOOGLE_APPLICATION_CREDENTIALS=/app/backend/keys/google-tts-key.json
  - TZ=Asia/Ho_Chi_Minh
```

#### Chạy Production Mode:

Để chạy production mode (sử dụng gunicorn thay vì Flask dev server):

```yaml
# Trong docker-compose.yml, thay đổi:
environment:
  - FLASK_ENV=production
  - FLASK_DEBUG=0
```

Hoặc set biến môi trường:
```bash
export FLASK_ENV=production
export FLASK_DEBUG=0
```

---

## 📁 CẤU TRÚC THƯ MỤC

```
360web/
├── backend/              # Flask Backend API
│   ├── app.py           # Main application
│   ├── entrypoint.py    # Entrypoint script (hot reload)
│   ├── routes/          # API routes
│   ├── uploads/         # Uploaded files
│   ├── static/tts/      # TTS audio files
│   └── keys/            # Google Cloud credentials
├── frontend/            # React Viewer App
│   ├── src/            # Source code
│   ├── public/         # Static assets
│   └── dist/           # Build output
├── cms-frontend/        # React CMS Admin
│   ├── src/            # Source code
│   ├── public/         # Static assets
│   └── dist/           # Build output
├── cms/
│   └── data/           # JSON data files (scenes.json, tours.json)
└── docker-compose.yml  # Docker Compose configuration
```

---

## 🔍 KIỂM TRA VÀ DEBUG

### Kiểm tra Backend hoạt động:

```bash
# Health check
curl http://localhost:5000/health

# Hoặc mở trình duyệt
http://localhost:5000/health
```

### Xem logs:

```bash
# Docker logs
docker-compose logs -f backend

# Local Python logs
# Logs sẽ hiển thị trong terminal khi chạy python app.py
```

### Debug Backend:

1. **Development mode**: Đã bật sẵn debug mode trong docker-compose.yml
2. **Hot reload**: Tự động reload khi sửa code trong `backend/`
3. **Error pages**: Flask sẽ hiển thị error traceback trong development mode

---

## 🐛 XỬ LÝ LỖI THƯỜNG GẶP

### Lỗi: Port đã được sử dụng

```bash
# Windows: Tìm process đang dùng port
netstat -ano | findstr :5000
# Kill process (thay PID bằng process ID)
taskkill /PID <PID> /F

# Linux/Mac: Tìm và kill process
lsof -ti:5000 | xargs kill -9
```

### Lỗi: Docker container không start

```bash
# Xem logs chi tiết
docker-compose logs backend

# Rebuild lại
docker-compose up --build --force-recreate backend
```

### Lỗi: Module không tìm thấy (Python)

```bash
# Đảm bảo đã activate virtual environment
# Windows:
.\venv\Scripts\Activate.ps1
# Linux/Mac:
source venv/bin/activate

# Cài lại dependencies
pip install -r requirements.txt
```

### Lỗi: Google TTS không hoạt động

- File key `backend/keys/google-tts-key.json` **KHÔNG** được upload lên GitHub vì lý do bảo mật.
- Khi triển khai, cần copy file này thủ công vào thư mục `backend/keys/`.
- Nếu chạy Docker, cần restart container sau khi chép key:

### Lỗi: Frontend không kết nối được Backend

- Kiểm tra Backend đang chạy tại port 5000
- Kiểm tra CORS settings trong `backend/app.py`
- Kiểm tra API endpoint trong frontend code

---

## 📝 CÁC LỆNH HỮU ÍCH

### Docker

```bash
# Xem tất cả containers
docker ps -a

# Xem images
docker images

# Xóa tất cả containers đã dừng
docker container prune

# Xóa tất cả images không dùng
docker image prune -a

# Xem resource usage
docker stats
```

### Development

```bash
# Format code (nếu có setup)
npm run format
# hoặc
pnpm format

# Lint code
npm run lint
# hoặc
pnpm lint

# Run tests (nếu có)
npm test
# hoặc
pnpm test
```

---

## 🚀 DEPLOYMENT

### Production Deployment với Docker:

1. **Build production images:**
```bash
docker-compose -f docker-compose.prod.yml build
```

2. **Chạy production:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

3. **Setup reverse proxy** (Nginx/Traefik) để:
   - SSL/HTTPS
   - Domain name
   - Load balancing

### Environment Variables cho Production:

- `FLASK_ENV=production`
- `FLASK_DEBUG=0`
- Setup proper secrets management
- Configure database (nếu có)

---

## 📞 HỖ TRỢ

Nếu gặp vấn đề, kiểm tra:

1. Logs của các services
2. File cấu hình (docker-compose.yml, .env)
3. Port conflicts
4. File permissions
5. Dependencies đã được cài đặt đầy đủ

---

## 📚 TÀI LIỆU THAM KHẢO

- [Docker Documentation](https://docs.docker.com/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)

---


