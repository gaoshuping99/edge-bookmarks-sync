import os
import json
import base64
import sqlite3
import keyring
import csv
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2

def get_encryption_key():
    local_state_path = os.path.expanduser('~/Library/Application Support/Microsoft Edge/Local State')
    with open(local_state_path, 'r', encoding='utf-8') as f:
        local_state = json.load(f)
    encrypted_key_b64 = local_state['os_crypt']['encrypted_key']
    encrypted_key = base64.b64decode(encrypted_key_b64)[5:]  # 去掉前缀
    # 获取Keychain主密码
    key = keyring.get_password('Chrome Safe Storage', 'Chrome')
    if not key:
        key = 'peanuts'  # 默认密码，部分老系统
    # PBKDF2派生
    return PBKDF2(key, b'saltysalt', 16, 1003)

def decrypt_password(ciphertext, key):
    if ciphertext[:3] == b'v10':
        iv = ciphertext[3:15]
        payload = ciphertext[15:]
        cipher = AES.new(key, AES.MODE_GCM, iv)
        decrypted = cipher.decrypt(payload)[:-16]  # 去掉tag
        return decrypted.decode(errors='ignore')
    else:
        # 旧版明文
        return ciphertext.decode(errors='ignore')

def export_passwords(profile_dir, output_csv):
    db_path = os.path.expanduser(f'~/Library/Application Support/Microsoft Edge/{profile_dir}/Login Data')
    if not os.path.exists(db_path):
        print('未找到Edge密码数据库')
        return False
    key = get_encryption_key()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('SELECT origin_url, username_value, password_value FROM logins')
    rows = cursor.fetchall()
    conn.close()
    with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['name', 'url', 'username', 'password', 'notes'])
        for url, username, password_value in rows:
            try:
                password = decrypt_password(password_value, key)
            except Exception as e:
                password = f'解密失败: {e}'
            writer.writerow(['', url, username, password, ''])
    return True

if __name__ == '__main__':
    import sys
    profile = sys.argv[1] if len(sys.argv) > 1 else 'Default'
    home = os.path.expanduser('~')
    output_csv = os.path.join(home, 'Desktop', 'edge_passwords.csv')
    if export_passwords(profile, output_csv):
        print(f'已导出到: {output_csv}')
    else:
        print('导出失败') 