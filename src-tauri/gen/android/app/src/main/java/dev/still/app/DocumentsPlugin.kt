package dev.still.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class TreeArgs { lateinit var uri: String }

@TauriPlugin
class DocumentsPlugin(private val activity: Activity) : Plugin(activity) {
    private var picking = false

    @Command
    fun pickDirectory(invoke: Invoke) {
        if (picking) { invoke.reject("A folder picker is already open."); return }
        picking = true
        try {
            // Grants live only for this activity/session; no workspace recovery or broad storage access.
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivityForResult(invoke, intent, "directoryPicked")
        } catch (error: Exception) {
            picking = false
            invoke.reject(error.message ?: "Unable to open folder picker.")
        }
    }

    @ActivityCallback
    fun directoryPicked(invoke: Invoke, result: ActivityResult) {
        picking = false
        val response = JSObject()
        val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
        if (result.resultCode == Activity.RESULT_OK && uri == null) {
            invoke.reject("The folder provider returned no URI.")
            return
        }
        response.put("uri", uri?.toString() ?: org.json.JSONObject.NULL)
        invoke.resolve(response)
    }

    @Command
    fun listDirectory(invoke: Invoke) {
        val args = invoke.parseArgs(TreeArgs::class.java)
        // Provider queries may block; keep them off the Android UI thread.
        Thread {
            try {
                val tree = Uri.parse(args.uri)
                require(tree.scheme == "content" && DocumentsContract.isTreeUri(tree)) {
                    "Select a document-provider folder."
                }
                val children = DocumentsContract.buildChildDocumentsUriUsingTree(
                    tree, DocumentsContract.getTreeDocumentId(tree)
                )
                val entries = JSArray()
                val columns = arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
                )
                val cursor = activity.contentResolver.query(children, columns, null, null, null)
                    ?: throw java.io.IOException("The folder provider returned no result.")
                cursor.use {
                    while (it.moveToNext()) {
                        val entry = JSObject()
                        entry.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, it.getString(0)).toString())
                        entry.put("name", it.getString(1) ?: "")
                        entry.put("mime", it.getString(2) ?: "")
                        entries.put(entry)
                    }
                }
                val response = JSObject()
                response.put("entries", entries)
                invoke.resolve(response)
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Unable to read the selected folder. Select it again to grant access.")
            }
        }.start()
    }
}
