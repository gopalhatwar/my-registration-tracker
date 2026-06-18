import unittest
from unittest.mock import patch, MagicMock
import os
import json
import urllib.request
import sys

# Ensure server module can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server

class TestUpstashDB(unittest.TestCase):
    
    def setUp(self):
        # Clear environment variables before each test
        if 'UPSTASH_REDIS_REST_URL' in os.environ:
            del os.environ['UPSTASH_REDIS_REST_URL']
        if 'UPSTASH_REDIS_REST_TOKEN' in os.environ:
            del os.environ['UPSTASH_REDIS_REST_TOKEN']
        
        # Temp file for local testing fallback
        self.test_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_temp_db.json')
        if os.path.exists(self.test_file):
            os.remove(self.test_file)

    def tearDown(self):
        if os.path.exists(self.test_file):
            os.remove(self.test_file)

    @patch('urllib.request.urlopen')
    def test_load_db_upstash_success(self, mock_urlopen):
        # Setup env variables
        os.environ['UPSTASH_REDIS_REST_URL'] = 'https://fake-upstash-url.com'
        os.environ['UPSTASH_REDIS_REST_TOKEN'] = 'fake-token'

        # Mock response for ["GET", "test_temp_db.json"] returning JSON data
        mock_data = {"key1": "value1", "key2": 123}
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"result": json.dumps(mock_data)}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Execute load_db
        res = server.load_db(self.test_file, default={})

        # Assertions
        self.assertEqual(res, mock_data)
        
        # Verify the request details
        mock_urlopen.assert_called_once()
        args, kwargs = mock_urlopen.call_args
        req = args[0]
        self.assertIsInstance(req, urllib.request.Request)
        self.assertEqual(req.get_method(), 'POST')
        self.assertEqual(req.headers['Authorization'], 'Bearer fake-token')
        self.assertEqual(req.headers['Content-type'], 'application/json')
        
        # Verify req body
        req_body = json.loads(req.data.decode('utf-8'))
        self.assertEqual(req_body, ["GET", "test_temp_db.json"])

    @patch('urllib.request.urlopen')
    def test_load_db_upstash_not_found(self, mock_urlopen):
        # Setup env variables
        os.environ['UPSTASH_REDIS_REST_URL'] = 'https://fake-upstash-url.com'
        os.environ['UPSTASH_REDIS_REST_TOKEN'] = 'fake-token'

        # Mock response for ["GET", "test_temp_db.json"] returning null (key not found)
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"result": None}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Execute load_db with default value
        default_val = {"default_key": "default_val"}
        res = server.load_db(self.test_file, default=default_val)

        # Assertions
        self.assertEqual(res, default_val)

    @patch('urllib.request.urlopen')
    def test_save_db_upstash_success(self, mock_urlopen):
        # Setup env variables
        os.environ['UPSTASH_REDIS_REST_URL'] = 'https://fake-upstash-url.com'
        os.environ['UPSTASH_REDIS_REST_TOKEN'] = 'fake-token'

        # Mock response for ["SET", "test_temp_db.json", "value"] returning {"result": "OK"}
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"result": "OK"}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Data to save
        data_to_save = {"user": "Gopal Hatwar"}

        # Execute save_db
        success = server.save_db(self.test_file, data_to_save)

        # Assertions
        self.assertTrue(success)
        mock_urlopen.assert_called_once()
        args, kwargs = mock_urlopen.call_args
        req = args[0]
        self.assertIsInstance(req, urllib.request.Request)
        
        # Verify req body
        req_body = json.loads(req.data.decode('utf-8'))
        self.assertEqual(req_body[0], "SET")
        self.assertEqual(req_body[1], "test_temp_db.json")
        self.assertEqual(json.loads(req_body[2]), data_to_save)

    def test_local_fallback_load_and_save(self):
        # No environment variables set -> should fall back to local disk JSON file
        
        # Test loading non-existent file returns default
        default_val = {"fallback": "enabled"}
        res = server.load_db(self.test_file, default=default_val)
        self.assertEqual(res, default_val)

        # Test saving to local disk
        data_to_save = {"local_key": "local_value"}
        success = server.save_db(self.test_file, data_to_save)
        self.assertTrue(success)
        self.assertTrue(os.path.exists(self.test_file))

        # Test loading existing local file
        loaded_data = server.load_db(self.test_file, default={})
        self.assertEqual(loaded_data, data_to_save)

if __name__ == '__main__':
    unittest.main()
