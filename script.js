// GANTI STRING INI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA
const SCRIPT_URL = 'URL_WEB_APP_ANDA_DISINI';

let databaseBarang = [];
let keranjang = [];

// Inisialisasi awal: Ambil data dari database saat aplikasi dimuat
window.onload = async () => {
    try {
        let response = await fetch(SCRIPT_URL);
        databaseBarang = await response.json();
        updateDropdownJenis();
        updateDropdownNama();
    } catch (error) {
        console.error("Gagal mengambil data database", error);
    }
};

// Navigasi Halaman (SPA)
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

// ================= HALAMAN 1: INPUT BARANG =================
function submitBarang(e) {
    e.preventDefault();
    let formData = new URLSearchParams();
    formData.append('action', 'addBarang');
    formData.append('jenis', document.getElementById('input-jenis').value);
    formData.append('nama', document.getElementById('input-nama').value);
    formData.append('harga', document.getElementById('input-harga').value);
    formData.append('ukuran', document.getElementById('input-ukuran').value);

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            alert("Barang berhasil ditambahkan!");
            document.getElementById('form-barang').reset();
            // Refresh database lokal
            window.onload(); 
        });
}

// ================= HALAMAN 2: TRANSAKSI =================
function lanjutKeBarang() {
    let nama = document.getElementById('trans-nama-pelanggan').value;
    let wa = document.getElementById('trans-no-wa').value;
    if(!nama || !wa) return alert("Isi Nama dan No WA dulu!");
    
    document.getElementById('step-pelanggan').style.display = 'none';
    document.getElementById('step-barang').style.display = 'block';
}

function updateDropdownJenis() {
    let select = document.getElementById('trans-jenis');
    let jenisUnik = [...new Set(databaseBarang.map(item => item.jenis))];
    select.innerHTML = jenisUnik.map(j => `<option value="${j}">${j}</option>`).join('');
}

function updateDropdownNama() {
    let select = document.getElementById('trans-nama');
    select.innerHTML = databaseBarang.map(item => `<option value="${item.nama}">${item.nama}</option>`).join('');
    // Auto-select jenis berdasarkan nama pertama, atau biarkan fungsi filter bekerja
    autoFillDetail();
}

// Fitur Navigasi Tombol Atas/Bawah untuk Jenis
function ubahJenis(arah) {
    let select = document.getElementById('trans-jenis');
    let index = select.selectedIndex + arah;
    if (index >= 0 && index < select.options.length) {
        select.selectedIndex = index;
        filterNamaBarang();
    }
}

// Jika Jenis dipilih, filter Nama Barang
function filterNamaBarang() {
    let jenisTerpilih = document.getElementById('trans-jenis').value;
    let selectNama = document.getElementById('trans-nama');
    let filterItems = databaseBarang.filter(item => item.jenis === jenisTerpilih);
    
    selectNama.innerHTML = filterItems.map(item => `<option value="${item.nama}">${item.nama}</option>`).join('');
    autoFillDetail();
}

// Jika Nama dipilih (atau berubah), auto fill harga, ukuran, dan koreksi Jenis Barang
function autoFillDetail() {
    let namaTerpilih = document.getElementById('trans-nama').value;
    let item = databaseBarang.find(i => i.nama === namaTerpilih);
    
    if (item) {
        document.getElementById('trans-harga').value = item.harga;
        document.getElementById('trans-ukuran').value = item.ukuran;
        // Koreksi sinkronisasi otomatis Jenis Barang
        document.getElementById('trans-jenis').value = item.jenis;
    }
}

document.getElementById('trans-nama').addEventListener('change', autoFillDetail);

function tambahKeKeranjang() {
    let nama = document.getElementById('trans-nama').value;
    let ukuran = document.getElementById('trans-ukuran').value;
    let harga = parseInt(document.getElementById('trans-harga').value);
    let jml = parseInt(document.getElementById('trans-jumlah').value);
    
    if (!nama || isNaN(harga)) return alert("Pilih barang dengan benar!");

    keranjang.push({ nama, ukuran, harga, jml, subtotal: harga * jml });
    renderKeranjang();
}

function renderKeranjang() {
    let tbody = document.querySelector('#tabel-keranjang tbody');
    tbody.innerHTML = keranjang.map(item => `
        <tr>
            <td>${item.nama}</td>
            <td>${item.ukuran}</td>
            <td>${item.harga}</td>
            <td>${item.jml}</td>
            <td>${item.subtotal}</td>
        </tr>
    `).join('');
}

function prosesBayar() {
    if(keranjang.length === 0) return alert("Keranjang kosong!");
    
    let totalItem = keranjang.reduce((sum, i) => sum + i.jml, 0);
    let totalHarga = keranjang.reduce((sum, i) => sum + i.subtotal, 0);
    let nama = document.getElementById('trans-nama-pelanggan').value;
    let wa = document.getElementById('trans-no-wa').value;

    // Simpan ke spreadsheet
    let formData = new URLSearchParams();
    formData.append('action', 'addTransaksi');
    formData.append('nama_pelanggan', nama);
    formData.append('no_wa', wa);
    formData.append('detail_pesanan', JSON.stringify(keranjang));
    formData.append('total_item', totalItem);
    formData.append('total_harga', totalHarga);

    fetch(SCRIPT_URL, { method: 'POST', body: formData }); // Dibiarkan asinkron jalan di background

    // Pindah ke Halaman Data Pesanan (Struk)
    tampilkanStruk(nama, wa, totalItem, totalHarga);
    showPage('page-pesanan');
    
    // Reset state transaksi
    document.getElementById('step-pelanggan').style.display = 'block';
    document.getElementById('step-barang').style.display = 'none';
}

// ================= HALAMAN 3: DATA PESANAN =================
function tampilkanStruk(nama, wa, totalItem, totalHarga) {
    document.getElementById('rekap-nama').innerText = nama;
    document.getElementById('rekap-wa').innerText = wa;
    document.getElementById('rekap-total-item').innerText = totalItem;
    document.getElementById('rekap-total-harga').innerText = totalHarga.toLocaleString('id-ID');

    let tbody = document.querySelector('#tabel-rekap tbody');
    tbody.innerHTML = keranjang.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.nama}</td>
            <td>${item.ukuran}</td>
            <td>${item.harga}</td>
            <td>${item.jml}</td>
        </tr>
    `).join('');
}

function kirimWhatsApp() {
    let nama = document.getElementById('rekap-nama').innerText;
    let wa = document.getElementById('rekap-wa').innerText;
    let totalHarga = document.getElementById('rekap-total-harga').innerText;
    
    // Format WA nomor pastikan mulai dari 62
    if(wa.startsWith('0')) wa = '62' + wa.substring(1);

    let pesan = `Halo ${nama},\nBerikut adalah detail pesanan Anda:\n\n`;
    keranjang.forEach((item, i) => {
        pesan += `${i+1}. ${item.nama} (Uk: ${item.ukuran}) - ${item.jml} x Rp ${item.harga}\n`;
    });
    pesan += `\n*Total Tagihan: Rp ${totalHarga}*\n\nTerima kasih telah berbelanja!`;

    let url = `https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`;
    window.open(url, '_blank');
    
    // Kosongkan keranjang setelah kirim
    keranjang = [];
}
