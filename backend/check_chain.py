from cloud_db_driver import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
logs = cursor.execute('SELECT log_id, previous_hash, current_hash FROM audit_logs ORDER BY log_id ASC').fetchall()
bad = [i for i in range(1, len(logs)) if logs[i]['previous_hash'] != logs[i-1]['current_hash']]
print('Total logs:', len(logs))
print('Bad indices:', bad)
if bad:
    print('Before bad:', logs[bad[0]-1])
    print('At bad:', logs[bad[0]])
