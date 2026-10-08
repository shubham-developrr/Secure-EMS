import sqlite3; conn=sqlite3.connect('secure_ems.db'); conn.row_factory=sqlite3.Row; print(dict(conn.execute('SELECT * FROM question_papers WHERE subject_code=\
A-12\').fetchone()))
