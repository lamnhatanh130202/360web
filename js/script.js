// viewer và các biến toàn cục
const viewer = new Marzipano.Viewer(document.getElementById("pano"));
let isAutoRotating = true;
let autoRotateInterval;
let autoRotateTimeout;
let currentView; //  Biến để theo dõi view hiện tại
const sceneCache = {};

// Danh sách tên khu vực
const khuVuc = {
    // tầng trệt và các khu vực kháce
    congtruong: "Cổng Chính",
    congphu: " Cổng Phụ",
    duonglencong: "Đường Lên Cổng",
    TrungtamPTNLS: "Trung Tâm PTNLS",
    phongtuyensinh: "Phòng Tuyển Sinh",
    loidi1: "dãy Học Hỏi Hiếu Hành 1",
    loidi2: "dãy Học Hỏi Hiếu Hành 2",
    truocphongan: "Trước Phòng Ăn",
    phongan: "Phòng Ăn",
    trcdaya: "Trước Dãy A",
    truockhoacntt: "Trước Khoa CNTT",
    a0_cntt: "Khoa CNTT ",
    a0_kientruc: "Khoa Kiến Trúc ",
    a0_ktoto: "Khoa Kỹ Thuật ÔTô ",
    a0_luat: "Khoa Luật ",
    a0_phongkebencntt: "Khoa ",
    a0_qtcn_logistic: "Khoa Quản Trị Công Nghiệp và logistics",
    a0_xahoihoc: "Khoa Xã Hội Học,Truyền Thông",
    a0_1: "Hành Lang Dãy A 1",
    a0_2: "Hành Lang Dãy A 2",

    santruong: " Giữa Sân Trường",
    
    
    b0_1: "Tầng Trệt Dãy B 1",
    b0_2:"Tầng Trệt Dãy B 2",
    // Tầng 1
    a1_1:"Tầng 1 dãy a",
    a1_2:"Tầng 1 dãy a 1",
    a1_3:"Tầng 1 dãy a 2",
    a1_al4:"Phòng Al.4",
    a1_hocvienkingsejong:"Học Viện King Sejong",
    b1_1:"Tầng 1 dãy b",
    b1_2:"Tầng 1 dãy b 1",
    b1_3:"Tầng 1 dãy b 2",
    b1_4:"Tầng 1 dãy b 3",
    b1_5:"Tầng 1 dãy b 4",
    // Các phòng ở tầng 1 khu b
    b1_datalab:"Phòng DataLab", 
    b1_phethong:"Phòng Nghiêm Cứu HTTM",
    b1_sejong5:"Phòng sejong5",
    b1_sejong4:"Phòng sejong4",
    b1_sejong6:"Phòng sejong6",
    b1_pm1:"Phòng máy 1",
    b1_pm2:"Phòng may 2",
    //tầng 2
    a2_1:"Tầng 2 dãy a",
    a2_2:"Tầng 2 dãy a 1",
    a2_3:"Tầng 2 dãy a 2",
    b2_1:"Tầng 2 dãy b",
    b2_2:"Tầng 2 dãy b 1",
    b2_3:"Tầng 2 dãy b 2",
    b2_4:"Tầng 2 dãy b 3",
    b2_5:"Tầng 2 dãy b 4",
    b2_plab:"Phòng Lab",
    b2_steamlab:"Phòng SteamLab",
    //tầng 3
    a3_trcthuvien: "Trước Thư Viện",
    a3_thuvien1: "Thư Viện 1",
    a3_thuvien2: "Thư Viện 2",
    a3_sauthuvien: "Sau Thư Viện",
    b3_1:"Tầng 3 dãy b",
    b3_2:"BIII.13A",
    b3_3:"BIII.11",
    b3_4:"Khoa xã hội và nhân văn",
    b3_5:"Trước Phòng BIII.14a",
    b3_6:"Cuối Hành Lang tầng 3",
    b3_14a:"Phòng BIII.14a",
    // tầng 4
    a4_1:"Tầng 4 dãy a",
    a4_2:"Tầng 4 dãy a 1",
    a4_3:"Tầng 4 dãy a 2",
    // tầng 5
    a5_1:"Tầng 5 dãy a",
    a5_2:"Tầng 5 dãy a 1",
    
    // tầng 6
    a6_1:"Tầng 4 dãy a",
    a6_2:"Tầng 6 dãy a 1",
    a6_3:"Tầng 6 dãy a 2",
};

// Danh sách scene và hotspot
const scenes = [
    //Dưới sân trường và tầng trệt
    {
        id: "congtruong",
        src: "./assets/congtruong.jpg",
        hotspots: [
            { yaw: -0.1, pitch: -0.15, text: "Lối đi lên", target: "duonglencong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.3, pitch: -0.1, text: "Trung tâm PTNLS", target: "TrungtamPTNLS", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.7, pitch: -0.1, text: "Phòng tuyển sinh", target: "phongtuyensinh", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "congphu",
        src: "./assets/congphu.jpg",
        hotspots: [
            { yaw: -0.3,pitch: -0.05, text: "Hành Lang dãy a", target: "a0_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }
        ]
    },
    {
        id: "phongtuyensinh",
        src: "./assets/phongtuyensinh.jpg",
        hotspots: [
            { yaw: -0.1, pitch: 0, text: "Cổng Chính", target: "congtruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }
        ]
    },
    {
        id: "TrungtamPTNLS",
        src: "./assets/TrungtamPTNLS.jpg",
        hotspots: [
            { yaw: 3.3, pitch: 0, text: "Cổng Chính", target: "congtruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }
        ]
    },
    {
        id: "duonglencong",
        src: "./assets/duonglencong.jpg",
        hotspots: [
            { yaw: -3.3, pitch: 0.1, text: "Quay lại Cổng Chính", target: "congtruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: 1, pitch: -0.15, text: "Đi lên Lối đi dãy Học Hỏi Hiếu Hành", target: "loidi1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }
        ]
    },
    {
        id: "santruong",
        src: "./assets/santruong.jpg",
        hotspots: [
            { yaw: -0.2,pitch: -0.05, text: "Trước dãy A", target: "trcdaya", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.7,pitch: -0.4, text: "Trước thư viện", target: "trcthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0.8, pitch: -0.05, text: "Dãy Học Hỏi Hiếu Hành", target: "loidi2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.2, pitch: -0.05, text: "Tầng Trệt Dãy B", target: "b0_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4, pitch: -0.05, text: "Tầng Trệt Dãy B 1", target: "b0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4, pitch: -0.35, text: "Tầng 1 Dãy B 1", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4, pitch: -0.65, text: "Tầng 2 Dãy B 1", target: "b2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4, pitch: -0.95, text: "Tầng 3 Dãy B 1", target: "b3_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.2,pitch: -0.25, text: "Tầng 1 dãy a", target: "a1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.2,pitch: -0.4, text: "Tầng 2 dãy a", target: "a2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.2,pitch: -0.6, text: "Tầng 4 dãy a", target: "a4_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.2,pitch: -0.7, text: "Tầng 5 dãy a", target: "a5_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.2,pitch: -0.85, text: "Tầng 6 dãy a", target: "a6_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        
        ]
    },
    
    {
        id: "loidi1",
        src: "./assets/loidi1.jpg",
        hotspots: [
            { yaw: 1.5, pitch: -0.05, text: "Quay lại Lối đi lên", target: "duonglencong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: ".//assets/icon/vitri.png" },
            { yaw: -1.4, pitch: -0.05, text: "Dãy Học Hỏi Hiếu Hành 2", target: "loidi2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -3.2, pitch: -0.05, text: "Trước Phòng Ăn", target: "truocphongan", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "loidi2",
        src: "./assets/loidi2.jpg",
        hotspots: [
            { yaw: 1.5, pitch: 0, text: "Dãy Học Hỏi Hiếu Hành", target: "loidi1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.6, pitch: -0.1, text: "Trước Dãy A", target: "trcdaya", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2.4, pitch: -0.1, text: "Sân Trường", target: "santruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }
        ]
    },
    {
        id: "truocphongan",
        src: "./assets/truocphongan.jpg",
        hotspots: [
            { yaw: 0, pitch: 0, text: "Dãy Học Hỏi Hiếu Hành", target: "loidi1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2.2, pitch: -0.1, text: "Phòng ăn", target: "phongan", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "phongan",
        src: "./assets/phongan.jpg",
        hotspots: [
            { yaw: 4, pitch: 0, text: "Rời Phòng Ăn", target: "truocphongan", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
            
        ]
    },
    
    {
        id: "b0_1",
        src: "./assets/b0_1.jpg",
        hotspots: [
            { yaw: 1.6, pitch: -0.0, text: "Tầng Trệt Dãy B 1", target: "b0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.5, pitch: -0.0, text: "Sân trường ", target: "santruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },

        ]
    },
    {
        id: "b0_2",
        src: "./assets/b0_2.jpg",
        hotspots: [
            { yaw: 1.3, pitch: -0.0, text: "Tầng Trệt Dãy B ", target: "b0_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: -0.0, text: "Sân trường ", target: "santruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2, pitch: -0.0, text: "Lên tầng 2 dãy B ", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
// Tầng trệt dãy a
    {
        id: "trcdaya",
        src: "./assets/truocdaya.jpg",
        hotspots: [
            { yaw: 1.7, pitch: -0.05, text: "Dãy Học Hỏi Hiếu Hành 2", target: "loidi2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0.9, pitch: -0.1, text: "Trước Khoa Công Nghệ Thông Tin", target: "truockhoacntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.4, text: "Hành Lanh dãy A", target: "a0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4.7, pitch: -0.05, text: "Cổng Phụ", target: "congphu", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.5, pitch: -0.1, text: "Sân Trường", target: "santruong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }
        ]
    },
    {
        id: "truockhoacntt",
        src: "./assets/truockhoacntt.jpg",
        hotspots: [
            { yaw: 0.06, pitch: -0.1, text: "Khoa Công Nghệ Thông Tin", target: "a0_cntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.3  , pitch: -0.1, text: "Khoa ", target: "a0_phongkebencntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.5  , pitch: 0.3, text: " Hành lanh dãy a  ", target: "a0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.1, pitch: -0, text: "Khoa Kiến Trúc", target: "a0_kientruc", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.7, pitch: -0, text: "Lên tầng 1", target: "a1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 3.3, pitch: 0.3, text: " Trước Dãy A", target: "trcdaya", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4.4, pitch: -0.05, text: "Cổng Phụ", target: "congphu", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
                ]
    },
    {
        id: "a0_1",
        src: "./assets/a0_1.jpg",
        hotspots: [
            
            
            { yaw: -0.2, pitch: 0.3, text: " Hành Lang Dãy A 2", target: "a0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2.2, pitch: 0.3, text: "Xã hội học và truyền thông", target: "a0_xahoihoc", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.3, pitch: -0.01, text: "Cổng Phụ", target: "congphu", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
                ]
    },
    {
        id: "a0_2",
        src: "./assets/a0_2.jpg",
        hotspots: [
            { yaw: 1.35, pitch: -0.1, text: "Khoa Công Nghệ Thông Tin", target: "a0_cntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.25, pitch: -0.1, text: "Khoa ", target: "a0_phongkebencntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.3, pitch: 0.25, text: "Trước phòng CNTT ", target: "truockhoacntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0.7, pitch: -0.1, text: "Khoa kỹ thuật ô tô", target: "a0_ktoto", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: -0.1, text: "Khoa Quản Trị Công Nghiệp và logistics", target: "a0_qtcn_logistic", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1, pitch: 0, text: "Khoa Luật", target: "a0_luat", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.2, pitch: 0.3, text: "Hành Lanh dãy A", target: "a0_1", image: "./assets/icon/congphu.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 3.3, pitch: 0.3, text: " Trước Dãy A", target: "trcdaya", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4.4, pitch: -0.05, text: "Cổng Phụ", target: "congphu", image: "./assets/icon/congphu.jpg",icon: "./assets/icon/vitri.png" },
                ]
    },

    {
        id: "a0_cntt",
        src: "./assets/a0_cntt.jpg",
        hotspots: [
            { yaw: 3.2, pitch: -0.10, text: "Rời Phòng", target: "truockhoacntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a0_kientruc",
        src: "./assets/a0_kientruc.jpg",
        hotspots: [
            { yaw: 0.03, pitch: 0.2, text: "Rời Phòng", target: "truockhoacntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "a0_ktoto",
        src: "./assets/a0_ktoto.jpg",
        hotspots: [
            { yaw: 0.03, pitch: 0.0, text: "Rời Phòng", target: "a0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "a0_luat",
        src: "./assets/a0_luat.jpg",
        hotspots: [
            { yaw: 0.03, pitch: -0.0, text: "Rời Phòng", target: "a0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "a0_phongkebencntt",
        src: "./assets/a0_phongkebencntt.jpg",
        hotspots: [
            { yaw: 0.03, pitch: 0.2, text: "Rời Phòng", target: "truockhoacntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    
    {
        id: "a0_qtcn_logistic",
        src: "./assets/a0_qtcn_logistic.jpg",
        hotspots: [
            { yaw: 0.03, pitch: -0.0, text: "Rời Phòng", target: "a0_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "a0_xahoihoc",
        src: "./assets/a0_xahoihoc.jpg",
        hotspots: [
            { yaw: 0.03, pitch: -0.0, text: "Rời Phòng", target: "a0_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    // tầng 1 dãy a 
    {
        id: "a1_1",
        src: "./assets/a1.jpg",
        hotspots: [
            { yaw: -3.2, pitch: -0.0, text: "Xuống tầng trệt", target: "truockhoacntt", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: -3.2, pitch: -0.1, text: "Lên Tầng 2", target: "a2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4.7, pitch: 0.1, text: "Tầng 1 dãy a 1", target: "a1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 6, pitch: 0.1, text: "Phòng Al.1", target: "a1_l1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a1_2",
        src: "./assets/a1.3.jpg",
        hotspots: [
            { yaw: 1.5, pitch: 0.05, text: "Tầng 1 dãy a ", target: "a1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.6, pitch: 0.00, text: "Tầng 1 dãy a 2", target: "a1_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a1_3",
        src: "./assets/a1hop.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.0, text: "Tầng 1 dãy a 1", target: "a1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1, pitch: 0.0, text: "Phòng Al.4", target: "a1_al4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.9, pitch: 0.0, text: "Tầng 1 dãy b 2", target: "b1_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 3.2, pitch: 0.0, text: "Học Viện King Sejong", target: "a1_hocvienkingsejong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a1_l1",
        src: "./assets/a1_l1.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.05, text: "Rời Phòng ", target: "a1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
            
        ]
    },
    
    {
        id: "a1_al4",
        src: "./assets/a1_al4.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.05, text: "Rời Phòng ", target: "a1_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
            
        ]
    },
    {
        id: "a1_hocvienkingsejong",
        src: "./assets/a1_hocvienkingsejong.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.00, text: "Rời Phòng", target: "a1_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    // tầng 1 dãy b
    {
        id: "b1_1",
        src: "./assets/b1.giua.2.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.0, text: "Phòng sejong 4", target: "b1_sejong4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0.8, pitch: 0.0, text: "Phòng sejong 5", target: "b1_sejong5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.4, pitch: 0.2, text: "Trước Phòng Trung tâm Nghiêm Cứu HTTM", target: "b1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.9, pitch: 0.0, text: "Phòng DataLAB", target: "b1_datalab", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.0, text: "Lên tầng 2 dãy b", target: "b2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.4, pitch: 0.0, text: "Tầng 1 Dãy b 3", target: "b1_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b1_2",
        src: "./assets/b1.giua.1.jpg",
        hotspots: [
            { yaw: 3.1, pitch: 0.0, text: "Tầng 1 dãy b", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.2, pitch: 0.0, text: "Tầng 1 Dãy b 2", target: "b1_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2.2, pitch: 0.0, text: "Tầng 1 Dãy b 3", target: "b1_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.0, text: "Phòng HTTM", target: "b1_phethong", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2, pitch: 0.0, text: "Phòng DataLAB", target: "b1_datalab", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.2, pitch: 0.0, text: "Phòng Sejong6", target: "b1_sejong6", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "b1_3",
        src: "./assets/b1.hl.jpg",
        hotspots: [
            { yaw: 1.2, pitch: 0.0, text: "Tầng 1 dãy a 3", target: "a1_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.7, pitch: 0.0, text: "Tầng 1 dãy b 1", target: "b1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        
        ]
    },
    {
        id: "b1_4",
        src: "./assets/b1.pm2.jpg",
        hotspots: [
            { yaw: 1.3, pitch: 0.3, text: "Tầng 1 dãy b 1", target: "b1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2, pitch: 0.0, text: "Tầng 1 dãy b 4", target: "b1_5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" }, 
            { yaw: 0, pitch: 0.0, text: "Phòng máy 2", target: "b1_pm2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.7, pitch: 0.0, text: "Phòng máy 1", target: "b1_pm1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "b1_5",
        src: "./assets/b1.cuoi.jpg",
        hotspots: [
            { yaw: 1.2, pitch: 0.0, text: "Tầng 1 dãy b 3", target: "b1_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    //các phòng ở tầng 1 dãy b
    {
        id: "b1_phethong",
        src: "./assets/b1_phethong.jpg",
        hotspots: [
            { yaw: 3, pitch: 0.3, text: "Ra Phòng", target: "b1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b1_datalab",
        src: "./assets/b1_datalab.jpg",
        hotspots: [
            { yaw: -0.5, pitch: 0.0, text: "Ra Phòng", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b1_sejong5",
        src: "./assets/b1_sejong5.jpg",
        hotspots: [
            { yaw: -0.1, pitch: 0.4, text: "Ra Phòng", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "b1_sejong4",
        src: "./assets/b1_sejong4.jpg",
        hotspots: [
            { yaw: -0.1, pitch: 0.4, text: "Ra Phòng", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "b1_sejong6",
        src: "./assets/b1_sejong6.jpg",
        hotspots: [
            { yaw: -0.1, pitch: 0.4, text: "Ra Phòng", target: "b1_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "b1_pm1",
        src: "./assets/b1_pm1.jpg",
        hotspots: [
            { yaw: 1.2, pitch: 0, text: "Ra Phòng", target: "b1_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "b1_pm2",
        src: "./assets/b1_pm2.jpg",
        hotspots: [
            { yaw: 1.2, pitch: 0, text: "Ra Phòng", target: "b1_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    //tầng 2 dãy b
    {
        id: "b2_1",
        src: "./assets/b2_1.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.0, text: "Tầng 2 Dãy b 2", target: "b2_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.0, text: "Lên Tầng 3", target: "b3_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.3, pitch: 0.4, text: "Xuống Tầng 1", target: "b1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: -0.5, pitch: 0.2, text: "Smart LAB", target: "b2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.4, pitch: 0.0, text: "Tầng 2 Dãy b 3", target: "b2_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b2_2",
        src: "./assets/b2_2.jpg",
        hotspots: [
            { yaw: 2.5, pitch: 0.0, text: "Tầng 2 dãy b", target: "b2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.75, pitch: 0.0, text: "Phòng Lab", target: "b2_plab", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.2, pitch: 0.0, text: "Phòng SteamLab", target: "b2_steamlab", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2, pitch: 0.0, text: "Tầng 2 Dãy b 2", target: "b2_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2.2, pitch: 0.0, text: "Tầng 2 Dãy b 3", target: "b2_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "b2_3",
        src: "./assets/b2_3.jpg",
        hotspots: [
            { yaw: 3, pitch: 0.2, text: "Tầng 2 dãy a 3", target: "a2_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0, pitch: 0.2, text: "Tầng 2 dãy b 1", target: "b2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b2_4",
        src: "./assets/b2_4.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.2, text: "Tầng 2 dãy b 1", target: "b2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.7, pitch: 0.2, text: "Tầng 2 dãy b 1", target: "b2_5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b2_5",
        src: "./assets/b2_5.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.0, text: "Tầng 2 dãy b 3", target: "b2_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b2_plab",
        src: "./assets/b2_plab.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.0, text: "Rời Phòng", target: "b2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            
        ]
    },
    {
        id: "b2_steamlab",
        src: "./assets/b2_steamlab.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.0, text: "Rời Phòng", target: "b2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },



    //tầng 2 dãy a 
    {
        id: "a2_1",
        src: "./assets/a2_1.jpg",
        hotspots: [
            { yaw: 4.8, pitch: 0, text: "Lên tầng 3", target: "a3_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4.8, pitch: 0.1, text: "Xuống tầng 1", target: "a1_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: 0, pitch: 0.3, text: "Tầng 2 dãy a 1", target: "a2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
 
    {
        id: "a2_2",
        src: "./assets/a2_2.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.3, text: "Tầng 2 dãy a 2", target: "a2_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 3.1, pitch: 0.3, text: "Tầng 2 dãy a ", target: "a2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a2_3",
        src: "./assets/a2_3.jpg",
        hotspots: [
            { yaw: -1.3, pitch: 0.2, text: "Tầng 2 dãy a ", target: "a2_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.3, text: "Tầng 2 dãy b 2", target: "b2_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    //tầng 3 dãy a and thư viện
    {
        id: "a3_trcthuvien",
        src: "./assets/trcthuvien.jpg",
        hotspots: [
            { yaw: 0.3, pitch: 0.0, text: "Trong Thư viện", target: "a3_thuvien1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1, pitch: 0.0, text: "Sau Thư viện", target: "a3_sauthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2.7, pitch: 0.0, text: "Lối đi dãy B", target: "b3_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "a3_thuvien1",
        src: "./assets/thuvien1.jpg",
        hotspots: [
            { yaw: 1.6, pitch: 0.3, text: "Trước Thư Viện", target: "a3_trcthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
            
        ]
    },
    {
        id: "a3_thuvien2",
        src: "./assets/thuvien2.jpg",
        hotspots: [
            { yaw: -1.7, pitch: -0.0, text: "Trong Thư viện 1", target: "a3_trcthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a3_sauthuvien",
        src: "./assets/sauthuvien.jpg",
        hotspots: [
            { yaw: 0.03, pitch: -0.0, text: "Trước Thư Viện", target: "a3_trcthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.7, pitch: -0.0, text: "xuống tầng 2", target: "a2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: -1.7, pitch: -0.1, text: "lên tầng 4", target: "a4_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    //tầng 3 dãy b
    {
        id: "b3_1",
        src: "./assets/b3_1.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.0, text: "Tầng 3 Dãy b 2", target: "b3_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.4, pitch: 0.2, text: "BIII.13A", target: "b3_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -0.2, pitch: 0.3, text: "Xuống tầng 2", target: "b2_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: -1.4, pitch: 0.0, text: "BIII.14a", target: "b3_5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b3_2",
        src: "./assets/b3_2.jpg",
        hotspots: [
            { yaw: 3.1, pitch: 0.0, text: "Tầng 3 dãy b", target: "b3_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 2, pitch: 0.0, text: "BIII.11", target: "b3_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -2.2, pitch: 0.0, text: "BIII.14a", target: "b3_5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
        ]
    },
    {
        id: "b3_3",
        src: "./assets/b3_3.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.3, text: "Khoa xã hội và nhân văn", target: "b3_4", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.7, pitch: 0.3, text: "BIII.13A", target: "b3_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b3_4",
        src: "./assets/b3_4.jpg",
        hotspots: [
            { yaw: -1.5, pitch: 0.3, text: "BIII.11", target: "b3_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 1.7, pitch: 0.2, text: "Thư Viện", target: "a3_trcthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b3_5",
        src: "./assets/b3_5.jpg",
        hotspots: [
            { yaw: 1.5, pitch: 0.0, text: "BIII.13A", target: "b3_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.0, text: "Phòng BIII.14A ", target: "b3_14a", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.6, pitch: 0.0, text: "Cuối HL tầng 3", target: "b3_6", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b3_6",
        src: "./assets/b3_6.jpg",
        hotspots: [
            { yaw: 1.4, pitch: 0.0, text: "BIII.14a", target: "b3_5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "b3_14a",
        src: "./assets/b3_14a.jpg",
        hotspots: [
            { yaw: 1.3 , pitch: 0.0, text: "Rời Phòng", target: "b3_5", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },

//tầng 4 dãy a

    {
        id: "a4_1",
        src: "./assets/a4_1.jpg",
        hotspots: [
            { yaw: 4.8, pitch: 0, text: "Lên tầng 5", target: "a5_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 4.8, pitch: 0.1, text: "Xuống tầng 3", target: "a3_sauthuvien", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: 0, pitch: 0.3, text: "Tầng 4 dãy a 1", target: "a4_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
 
    {
        id: "a4_2",
        src: "./assets/a4_2.jpg",
        hotspots: [
            { yaw: 0, pitch: 0.3, text: "Tầng 4 dãy a 2", target: "a4_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 3.1, pitch: 0.3, text: "Tầng 4 dãy a ", target: "a4_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a4_3",
        src: "./assets/a4_3.jpg",
        hotspots: [
            { yaw: 1.1, pitch: 0.3, text: "Tầng 4 dãy a 1 ", target: "a4_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.7, pitch: 0.1, text: "Tầng 5 dãy a 2", target: "a5_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    //tầng 5 dãy a
    {
        id: "a5_1",
        src: "./assets/a5_1.jpg",
        hotspots: [
            { yaw: -1.6, pitch: 0, text: "Lên tầng 6", target: "a5_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: -1.6, pitch: 0.1, text: "Xuống tầng 5", target: "a4_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
 
    {
        id: "a5_2",
        src: "./assets/a5_2.jpg",
        hotspots: [
            { yaw: 2.9, pitch: 0.1, text: "Tầng 4 dãy a 2", target: "a4_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    //tầng 6 dãy a
    {
        id: "a6_1",
        src: "./assets/a6_1.jpg",
        hotspots: [
            
            { yaw: 5.3, pitch: 0.1, text: "Xuống tầng 5", target: "a5_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: 0, pitch: 0.3, text: "Tầng 6 dãy a 1", target: "a6_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
 
    {
        id: "a6_2",
        src: "./assets/a6_2.jpg",
        hotspots: [
            { yaw: 3.1, pitch: 0.3, text: "Tầng 6 dãy a 2", target: "a6_3", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            { yaw: 0, pitch: 0.3, text: "Tầng 6 dãy a ", target: "a6_1", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
    {
        id: "a6_3",
        src: "./assets/a6_3.jpg",
        hotspots: [
            { yaw: -1.5, pitch: 0.1, text: "xuống tầng 5 ", target: "a5_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitrixuong.png" },
            { yaw: 1.3, pitch: 0.3, text: "Tầng 6 dãy a 1", target: "a6_2", image: "./assets/anhminhhoa/anhcongtruong.jpg",icon: "./assets/icon/vitri.png" },
            
        ]
    },
];

// Cập nhật hàm điều khiển xoay
function startAutoRotate(view) {
    if (!isAutoRotating) return; // Kiểm tra trạng thái trước khi bắt đầu
    
    stopAutoRotate(); // Dừng interval hiện tại nếu có
    autoRotateInterval = setInterval(() => {
        if (view) {
            view.setYaw(view.yaw() + 0.001);
        }
    }, 16);
}

function stopAutoRotate() {
    if (autoRotateInterval) {
        clearInterval(autoRotateInterval);
        autoRotateInterval = null;
    }
}

function resetAutoRotate(view) {
    if (!isAutoRotating) return; // Không reset nếu đang tắt

    clearTimeout(autoRotateTimeout);
    autoRotateTimeout = setTimeout(() => {
        startAutoRotate(view);
    }, 3000);
}

function toggleAutoRotate(view, button) {
    isAutoRotating = !isAutoRotating;
    const buttonText = isAutoRotating ? "Dừng lại" : "Tiếp tục";
    button.innerText = buttonText;

    if (isAutoRotating) {
        startAutoRotate(view);
    } else {
        stopAutoRotate();
    }
}

// Hàm di chuyển mượt mà
function smoothMove(start, end, duration, updateCallback, callback) {
    const startTime = performance.now();
    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = start + (end - start) * easeInOutCubic(progress);
        updateCallback(value);
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else if (callback) {
            callback();
        }
    }
    requestAnimationFrame(animate);
}

// Hàm cập nhật tên khu vực
function updateTenKhuVuc(sceneId) {
    const tenKhuVucElement = document.getElementById("tenKhuVuc");
    tenKhuVucElement.textContent = `Tên khu vực: ${khuVuc[sceneId] || "Không xác định"}`;
}

// Hàm tạo và thêm hotspot
function addHotspot(scene, hotspotData) {
    const hotspotElement = document.createElement("div");
    hotspotElement.classList.add("hotspot");

    const iconElement = document.createElement("img");
    iconElement.src = hotspotData.icon || "./assets/icon/vitri.png";
    iconElement.classList.add("hotspot-icon");
    hotspotElement.appendChild(iconElement);

    const infoElement = document.createElement("div");
    infoElement.classList.add("hotspot-info");

    const imageElement = document.createElement("img");
    imageElement.src = hotspotData.image;
    infoElement.appendChild(imageElement);

    const textElement = document.createElement("div");
    textElement.innerText = hotspotData.text;
    infoElement.appendChild(textElement);

    hotspotElement.appendChild(infoElement);

    hotspotElement.addEventListener("click", () => {
        const targetScene = scenes.find(s => s.id === hotspotData.target);
        if (targetScene) {
            loadScene(targetScene);
            updateTenKhuVuc(hotspotData.target); // Cập nhật tên khu vực khi click hotspot
        }
    });

    scene.hotspotContainer().createHotspot(hotspotElement, { 
        yaw: hotspotData.yaw, 
        pitch: hotspotData.pitch 
    });
}

// Hàm tạo scene
function createScene(sceneData) {
    const source = Marzipano.ImageUrlSource.fromString(sceneData.src);
    const geometry = new Marzipano.EquirectGeometry([{ width: 3500 }]);
    const limiter = Marzipano.RectilinearView.limit.traditional(1024, 120 * Math.PI / 180);
    const view = new Marzipano.RectilinearView({ yaw: 0, pitch: 0, fov: Math.PI / 3 }, limiter);
    const scene = viewer.createScene({ source, geometry, view });

    sceneData.hotspots.forEach(hotspotData => {
        addHotspot(scene, hotspotData);
    });

    return { scene, view };
}

// Cập nhật hàm loadScene
function loadScene(sceneData) {
    if (!sceneCache[sceneData.id]) {
        sceneCache[sceneData.id] = createScene(sceneData);
    }
    
    
    const { scene, view } = sceneCache[sceneData.id];
    currentView = view; // Lưu view hiện tại
    scene.switchTo();
      // Thiết lập các nút điều khiển
      setupControls(view);
      // Bắt đầu xoay tự động sau khi load scene
    if (isAutoRotating) {
        setTimeout(() => {
            startAutoRotate(view);
        }, 200); // Đợi 500ms để scene load xong
    }
}

    
    // Tách riêng phần thiết lập controls
function setupControls(view) {
    document.getElementById("left").onclick = () => {
        stopAutoRotate();
        const currentYaw = view.yaw();
        smoothMove(currentYaw, currentYaw - 0.1, 500, 
            value => view.setYaw(value), 
            () => resetAutoRotate(view)
        );
    };

    document.getElementById("right").onclick = () => {
        stopAutoRotate();
        const currentYaw = view.yaw();
        smoothMove(currentYaw, currentYaw + 0.5, 500, 
            value => view.setYaw(value), 
            () => resetAutoRotate(view)
        );
    };

    document.getElementById("zoomIn").onclick = () => {
        const currentFov = view.fov();
        smoothMove(currentFov, currentFov * 0.8, 300,
            value => view.setFov(value)
        );
    };

    document.getElementById("zoomOut").onclick = () => {
        const currentFov = view.fov();
        smoothMove(currentFov, currentFov * 1.2, 300,
            value => view.setFov(value)
        );
    };

     const toggleButton = document.getElementById("toggleAutoRotate");
    toggleButton.innerText = isAutoRotating ? "Dừng lại" : "Tiếp tục";
    toggleButton.onclick = () => toggleAutoRotate(view, toggleButton);


    // Bắt đầu xoay tự động
    if (isAutoRotating) {
        startAutoRotate(view);
    }
}

// Khởi tạo menu và sự kiện
function initializeMenu() {
    const menuButton = document.getElementById("menuButton");
    const menuList = document.getElementById("menuList");

    menuButton.addEventListener("click", () => {
        menuList.style.display = menuList.style.display === "block" ? "none" : "block";
    });

    document.querySelectorAll("#menuList li > span").forEach(item => {
        item.addEventListener("click", () => {
            item.parentNode.classList.toggle("open");
        });
    });

    document.querySelectorAll("#menuList [data-scene]").forEach(item => {
        item.addEventListener("click", () => {
            const sceneId = item.getAttribute("data-scene");
            const sceneData = scenes.find(s => s.id === sceneId);
            if (sceneData) {
                loadScene(sceneData);
                updateTenKhuVuc(sceneId);
                menuList.style.display = "none";
            }
        });
    });
}

// Khởi tạo preview khi hover
function initializePreview() {
    const hoverPreview = document.getElementById('hoverPreview');
    const previewImage = document.getElementById('previewImage');

    document.querySelectorAll('#menuList li[data-preview]').forEach(menuItem => {
        menuItem.addEventListener('mouseover', (event) => {
            const previewSrc = menuItem.getAttribute('data-preview');
            if (previewSrc) {
                previewImage.src = previewSrc;
                hoverPreview.style.display = 'block';
            }
        });

        menuItem.addEventListener('mouseout', () => {
            hoverPreview.style.display = 'none';
        });

        menuItem.addEventListener('mousemove', (event) => {
            hoverPreview.style.left = `${event.pageX + 10}px`;
            hoverPreview.style.top = `${event.pageY + 10}px`;
        });
    });
}



// Cập nhật hàm initialize
function initialize() {
    initializeMenu();
    initializePreview();
}
 // Load scene đầu tiên và bắt đầu xoay
 loadScene(scenes[0]);
  // Đảm bảo nút toggle hiển thị đúng trạng thái
  const toggleButton = document.getElementById("toggleAutoRotate");
  toggleButton.innerText = isAutoRotating ? "Dừng lại" : "Tiếp tục";

// Chạy ứng dụng
initialize();