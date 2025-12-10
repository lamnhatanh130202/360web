# 🌐 360 Virtual Tour Web Application

Ứng dụng Virtual Tour 360 độ với Backend Flask, Frontend React và CMS Admin.

## 🚀 Quick Start

### Deploy Production (Khuyến nghị)

**Windows:**
```powershell
# Copy file cấu hình
copy env.example .env
# Chỉnh sửa .env nếu cần

# Build và deploy
.\build.ps1
.\deploy.ps1
```

**Linux/Mac:**
```bash
# Copy file cấu hình
cp env.example .env
# Chỉnh sửa .env nếu cần

# Build và deploy
chmod +x build.sh deploy.sh
./build.sh
./deploy.sh
```

**Truy cập:**
- Frontend: http://localhost:8080
- Backend API: http://localhost:5000
- CMS Admin: http://localhost:8080/cms

### Chạy Development Mode

```bash
# Build và chạy tất cả services
docker-compose up --build

# Truy cập:
# - Frontend: http://localhost:8080
# - Backend API: http://localhost:5000
# - CMS Admin: http://localhost:8080/cms
```

### Chạy Development Mode (Không Docker)

**Backend:**
```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
pip install -r requirements.txt
python app.py
```

**Frontend:**
```bash
cd frontend
pnpm install
pnpm dev
```

**CMS Frontend:**
```bash
cd cms-frontend
pnpm install
pnpm dev
```

## 📚 Tài liệu chi tiết

- **[DEPLOY_QUICK.md](./DEPLOY_QUICK.md)** - Hướng dẫn deploy nhanh (3 bước)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Hướng dẫn deploy chi tiết lên các platform
- **[HUONG_DAN_CHAY_APP.md](./HUONG_DAN_CHAY_APP.md)** - Hướng dẫn chạy app và development

## 📁 Cấu trúc dự án

```
360web/
├── backend/          # Flask Backend API
├── frontend/         # React Viewer App
├── cms-frontend/     # React CMS Admin
├── cms/data/         # JSON data files
└── docker-compose.yml
```

## 🔧 Tech Stack

- **Backend**: Flask (Python), Gunicorn
- **Frontend**: React, Vite, Marzipano
- **CMS**: React, React Router
- **Container**: Docker, Docker Compose

## 📝 Lưu ý

- Backend hỗ trợ hot reload trong development mode
- Cần file `backend/keys/google-tts-key.json` để sử dụng tính năng TTS
- Port mặc định: Backend (5000), Frontend (8080)

---

**Xem [HUONG_DAN_CHAY_APP.md](./HUONG_DAN_CHAY_APP.md) để biết thêm chi tiết.**

