import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException


DateFrom=input("Enter Published From Date in dd/mm/yyyy format : ")
if not DateFrom:
    print("Published From Date is required")
    exit()
DateTo = input("Enter Publish to date in dd/mm/yyyy format : ")
if not DateTo:
    print("Published to Date is required")
    exit()

browser = webdriver.Chrome(executable_path=r"H:\Whatsspp\scrape\chromedriver.exe")
browser.implicitly_wait(5)
browser.get(('https://www.publiccontractsscotland.gov.uk/search/search_mainpage.aspx'))
fromb = browser.find_element_by_name("ctl00$ContentPlaceHolder1$rdFromDate$dateInput")
fromb.send_keys(DateFrom)
fromto = browser.find_element_by_name("ctl00$ContentPlaceHolder1$rdToDate$dateInput")
fromto.send_keys(DateTo)
browser.find_element_by_name("ctl00$ContentPlaceHolder1$cmdSearch").click()
time.sleep(1)
browser.find_element_by_xpath("//*[@id='ctl00_ContentPlaceHolder1_grdResults']/tbody/tr[3]/td[2]/a").click()
time.sleep(1)
browser.find_element_by_xpath("//*[@id='ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lnkDownloadXml']").click()
browser.back()
file=[]
for i in range(3,53):
    xmla = browser.find_element_by_xpath("//*[@id='ctl00_ContentPlaceHolder1_grdResults']/tbody/tr[%s]/td[2]/a"%(i))
    file.append(xmla)

while 1 < 2:
    for row in file:
        row.click()
        time.sleep(1)
        browser.find_element_by_xpath("//*[@id='ctl00_ContentPlaceHolder1_tab_StandardNoticeView1_notice_introduction1_lnkDownloadXml']").click()
        browser.back()

#browser.find_elements_by_xpath("//*[@id='ctl00_ContentPlaceHolder1_grdResults']/tbody/tr[3]/td[2]/a").click()
#result=sel.find_element_by_xpath("//a[not((//div[contains(@class,'s')]//div[contains(@class,'kv')]//cite)[%s])]|((//div[contains(@class,'s')]//div[contains(@class,'kv')]//cite)[%s])"%(i,i)).text
