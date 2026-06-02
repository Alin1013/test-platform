import pymysql

# 修改 PyMySQL 的版本信息以满足 Django 的要求
pymysql.version_info = (2, 2, 1, "final", 0)
pymysql.__version__ = "2.2.1"
pymysql.install_as_MySQLdb()
