import csv, sys, os
from lxml import etree

def main():

	csvFile = 'test.csv'
	xmlFile = open('myData.xml', 'w')
	csvData = csv.reader(open(csvFile), delimiter='\t')

	header = csvData.next()
	counter = 0
	root = etree.Element('root')
	xmlFile.write('<?xml version="1.0" encoding="UTF-8" ?> \n')

	for row in csvData:
		products = etree.SubElement(root,'products')
		for index in range(0, len(header)):
			print row[index]
			headLine = etree.SubElement(products, header[index])
			headLine.text = row[index].decode('utf-8')
			products.append(headLine)

	result = etree.tostring(root, pretty_print=True)
	xmlFile.write(result)


if __name__ == '__main__':
	main()
