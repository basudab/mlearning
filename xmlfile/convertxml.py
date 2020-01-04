import glob
from xml.etree import ElementTree

def newRunRun(folder):
    xml_files = glob.glob(folder+"/*.xml")
    node = None
    for xmlFile in xml_files:
        tree = ElementTree.parse(xmlFile)
        root = tree.getroot()
        if node is None:
            node = root
        else:
            elements = root.find("./results")
            for element in elements._children:
                node[1].append(element)
    print ElementTree.tostring(node)

folder = "resources"
newRunRun(folder) 
