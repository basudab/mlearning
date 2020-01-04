from selenium import webdriver
from selenium.webdriver.common.keys import Keys
import time

class TenderScrape:
    def __init__(self,dateFrom,dateTo):
        self.dateFrom = dateFrom
        self.dateTo = dateTo
        self.scrape = webdriver.chrome()
    def finding(self):
        scrape = self.scrape
        scrape.get('https://www.publiccontractsscotland.gov.uk/search/search_mainpage.aspx')
        time.sleep(2)
        fromdate = browser.find_element_by_name("ctl00$ContentPlaceHolder1$rdFromDate$dateInput")
        todate = browser.find_element_by_name("ctl00$ContentPlaceHolder1$rdToDate$dateInput")
        fromdate.send_keys(dateFrom)
        todate.send_keys(dateTo)
        scrape.find_element_by_name("ctl00$ContentPlaceHolder1$cmdSearch").click()
        time.sleep(2)
datein = input('Please Enter Your from date (dd/mm/yyyy): ')
dateout = input('Please Enter Your to date (dd/mm/yyyy): ')
TenderScrape(datein,dateout)
