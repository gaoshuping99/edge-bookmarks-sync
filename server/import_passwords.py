# -*- coding: utf-8 -*-
import time
import pyautogui
from selenium import webdriver
import os

def import_passwords(csv_path):
    # 启动Chrome并打开密码设置页
    options = webdriver.ChromeOptions()
    options.add_argument('--start-maximized')
    driver = webdriver.Chrome(options=options)
    driver.get('chrome://settings/passwords')
    time.sleep(3)

    # 模拟点击右上角菜单按钮（坐标需根据实际屏幕调整）
    pyautogui.moveTo(1800, 120, duration=0.5)  # 这里的坐标请根据实际分辨率调整
    pyautogui.click()
    time.sleep(1)
    # 按下方向键选择"导入"
    pyautogui.press('down', presses=2, interval=0.3)
    pyautogui.press('enter')
    time.sleep(1)
    # 输入文件路径并回车
    pyautogui.write(os.path.abspath(csv_path))
    pyautogui.press('enter')
    time.sleep(3)
    driver.quit()

if __name__ == '__main__':
    import_passwords('edge_passwords.csv') 