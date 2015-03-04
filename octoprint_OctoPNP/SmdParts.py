# coding=utf-8
from __future__ import absolute_import

import xml.etree.ElementTree as ET

class SmdParts():

	def __init__(self):
		self._et = None
		pass

	def load(self, xmlstring):
		self._et = ET.fromstring(xmlstring)

	def unload(self):
		self._et = None

	def isFileLoaded(self):
		if self._et is not None:
			return True
		else:
			return False

	def getPartCount(self):
		count = 0
		for elem in self._et.findall("./part"):
			count += 1
		return count

	#return the nr of the box this part is supposed to be in
	def getPartPosition(self, partnr):
		return int(self._et.find("./part[@id='" + str(partnr) + "']/position").get("box"))

	def getPartHeight(self, partnr):
		return float(self._et.find("./part[@id='" + str(partnr) + "']/size").get("height"))

	def getPartDestination(self, partnr):
		x = float(self._et.find("./part[@id='" + str(partnr) + "']/destination").get("x"))
		y = float(self._et.find("./part[@id='" + str(partnr) + "']/destination").get("y"))
		z = float(self._et.find("./part[@id='" + str(partnr) + "']/destination").get("z"))
		orientation = float(self._et.find("./part[@id='" + str(partnr) + "']/destination").get("orientation"))
		return [x, y, z, orientation]