' @rokucommunity/promises v0.7.1
' Enable verbose debugging of the promises library
' Enable the generation of a stack trace when a callback is registered for a promise
' This can later be used to find the registration location of the promise in
' the code. This is useful for debugging promise chains that are not working as expected.
' Create a new promise
function create() as dynamic
    'create a unique ID for this promise
    id = "promise-" + internal_createUuid()
    node = createObject("roSGNode", "Promise")
    node.id = id
    return node
end function

' TODO rename this to `then` once BrighterScript supports using keywords as namespaced function names
function onThen(promise as dynamic, callback = invalid as dynamic, context = "__INVALID__" as object) as dynamic
    if callback = invalid then
        callback = internal_defaultThenCallback
    end if
    return internal_on("then", promise, callback, context)
end function

' TODO rename this to `catch` once BrighterScript supports using keywords as namespaced function names
function onCatch(promise as dynamic, callback = invalid as dynamic, context = "__INVALID__" as object) as dynamic
    if callback = invalid then
        callback = internal_defaultCatchCallback
    end if
    return internal_on("catch", promise, callback, context)
end function

' TODO rename this to `finally` once BrighterScript supports using keywords as namespaced function names
function onFinally(promise as dynamic, callback = invalid as dynamic, context = "__INVALID__" as object) as dynamic
    if callback = invalid then
        callback = internal_defaultFinallyCallback
    end if
    return internal_on("finally", promise, callback, context)
end function

' The Promise.try() method takes a callback of any kind (returns or throws, synchronously or asynchronously) and wraps its result in a Promise.
' @param {function} callback - The callback to wrap in a promise
' @param {dynamic} args - The arguments to pass to the callback. Max 32 arguments.
function try(callback as Function, args = invalid as dynamic) as dynamic
    try
        result = internal_callWithArgs(callback, args)
        return ensurePromise(result)
    catch e
        return reject(e)
    end try
end function

' Takes an array of promises as input and returns a single Promise.
' This returned promise fulfills when all of the input's promises fulfill (including when an empty array is passed), with an array of the fulfillment values.
' It rejects when any of the input's promises rejects, with this first rejection reason.
function all(promiseArray as dynamic) as dynamic
    ' Create a deferred to be resolved later
    deferred = create()
    if type(promiseArray) = "roArray" and not promiseArray.isEmpty() then
        ' Track the state and results of all the promises
        state = {
            deferred: deferred
            results: []
            resolvedCount: 0
            total: promiseArray.count()
            done: false
        }
        for i = 0 to promiseArray.count() - 1
            promise = promiseArray[i]
            if isPromise(promise) then
                ' Watch for both resolved or rejected promises
                onThen(promise, sub(result as dynamic, context as dynamic)
                    ' Do not process any promises that come in late
                    ' This can happen if any of the other promises reject
                    if not context.state.done then
                        ' Always assign the result to the origin index so results are in the same
                        ' order as the supplied promiseArray
                        context.state.results[context.index] = result
                        context.state.resolvedCount++
                        if context.state.resolvedCount = context.state.total then
                            ' All the promises are resolved.
                            ' Resolve the deferred and make the state as complete
                            context.state.done = true
                            resolve(context.state.results, context.state.deferred)
                        end if
                    end if
                end sub, {
                    state: state
                    index: i
                })
                onCatch(promise, sub(error as dynamic, state as dynamic)
                    ' This shouldn't happen but if we somehow get a rejected promise after
                    ' the state is marked as done we should ignore this callback
                    if not state.done then
                        ' Immediately mark the state as done and reject the deferred
                        ' with the error from the rejected promise the first time any
                        ' promise rejects regardless where in the promise array it was
                        ' located.
                        state.done = true
                        reject(error, state.deferred)
                    end if
                end sub, state)
            else
                ' The value in the promise array is not a promise.
                ' Immediately set the result.
                state.results[i] = promise
                state.resolvedCount++
                if state.resolvedCount = state.total then
                    ' All the promises are resolved.
                    ' Resolve the deferred and make the state as complete
                    state.done = true
                    resolve(state.results, state.deferred)
                end if
            end if
        end for
    else
        if type(promiseArray) = "roArray" then
            ' Resolve when the array is empty
            resolve(promiseArray, deferred)
        else
            ' Reject if the supplied list is not an array
            try
                throw "Did not supply an array"
            catch e
                reject(e, deferred)
            end try
        end if
    end if
    return deferred
end function

' Takes an array of promises as input and returns a single Promise.
' This returned promise fulfills when all of the input's promises settle (including when an empty array is passed),
' with an array of objects that describe the outcome of each promise.
function allSettled(promiseArray as dynamic) as dynamic
    ' Create a deferred to be resolved later
    deferred = create()
    if type(promiseArray) = "roArray" and not promiseArray.isEmpty() then
        ' Track the state and results of all the promises
        state = {
            deferred: deferred
            results: []
            resolvedCount: 0
            total: promiseArray.count()
            done: false
        }
        for i = 0 to promiseArray.count() - 1
            promise = promiseArray[i]
            if isPromise(promise) then
                ' Watch for both resolved or rejected promises
                onThen(promise, sub(result as dynamic, context as dynamic)
                    ' Do not process any promises that come in late
                    ' This can happen if any of the other promises reject
                    if not context.state.done then
                        ' Always assign the result to the origin index so results are in the same
                        ' order as the supplied promiseArray
                        context.state.results[context.index] = {
                            status: "resolved"
                            value: result
                        }
                        context.state.resolvedCount++
                        if context.state.resolvedCount = context.state.total then
                            ' All the promises are resolved.
                            ' Resolve the deferred and make the state as complete
                            context.state.done = true
                            resolve(context.state.results, context.state.deferred)
                        end if
                    end if
                end sub, {
                    state: state
                    index: i
                })
                onCatch(promise, sub(error as dynamic, context as dynamic)
                    ' Do not process any promises that come in late
                    ' This can happen if any of the other promises reject
                    if not context.state.done then
                        ' Always assign the result to the origin index so results are in the same
                        ' order as the supplied promiseArray
                        context.state.results[context.index] = {
                            status: "rejected"
                            reason: error
                        }
                        context.state.resolvedCount++
                        if context.state.resolvedCount = context.state.total then
                            ' All the promises are resolved.
                            ' Resolve the deferred and make the state as complete
                            context.state.done = true
                            resolve(context.state.results, context.state.deferred)
                        end if
                    end if
                end sub, {
                    state: state
                    index: i
                })
            else
                ' The value in the promise array is not a promise.
                ' Immediately set the result.
                state.results[i] = {
                    status: "resolved"
                    value: promise
                }
                state.resolvedCount++
                if state.resolvedCount = state.total then
                    ' All the promises are resolved.
                    ' Resolve the deferred and make the state as complete
                    state.done = true
                    resolve(state.results, state.deferred)
                end if
            end if
        end for
    else
        if type(promiseArray) = "roArray" then
            ' Resolve when the array is empty
            resolve(promiseArray, deferred)
        else
            ' Reject if the supplied list is not an array
            try
                throw "Did not supply an array"
            catch e
                reject(e, deferred)
            end try
        end if
    end if
    return deferred
end function

' Takes an array of promises as input and returns a single Promise.
' This returned promise fulfills when any of the input's promises fulfills, with this first fulfillment value.
' It rejects when all of the input's promises reject (including when an empty array is passed), with an AggregateError containing an array of rejection reasons.
function any(promiseArray as dynamic) as dynamic
    ' Create a deferred to be resolved later
    deferred = create()
    if type(promiseArray) = "roArray" and not promiseArray.isEmpty() then
        ' Track the state and results of all the promises
        state = {
            deferred: deferred
            errors: []
            resolvedCount: 0
            total: promiseArray.count()
            done: false
        }
        for i = 0 to promiseArray.count() - 1
            promise = promiseArray[i]
            if isPromise(promise) then
                if promise.promiseState = "resolved" then
                    ' Do not process any promises that come in after the first resolved one
                    if not state.done then
                        state.done = true
                        resolve(promise.promiseResult, state.deferred)
                    end if
                else
                    ' Watch for both resolved or rejected promises
                    onThen(promise, sub(result as dynamic, state as dynamic)
                        ' Do not process any promises that come in after the first resolved one
                        if not state.done then
                            state.done = true
                            resolve(result, state.deferred)
                        end if
                    end sub, state)
                    onCatch(promise, sub(error as dynamic, context as dynamic)
                        ' Do not process any promises that come in late
                        ' This can happen if any of the other promises reject
                        if not context.state.done then
                            ' Always assign the result to the origin index so results are in the same
                            ' order as the supplied promiseArray
                            context.state.errors[context.index] = error
                            context.state.resolvedCount++
                            if context.state.resolvedCount = context.state.total then
                                ' All the promises are resolved.
                                ' Resolve the deferred and make the state as complete
                                context.state.done = true
                                try
                                    throw {
                                        message: "All promises were rejected"
                                        errors: context.state.errors
                                    }
                                catch e
                                    reject(e, context.state.deferred)
                                end try
                            end if
                        end if
                    end sub, {
                        state: state
                        index: i
                    })
                end if
            else
                ' The value in the promise array is not a promise.
                ' Immediately set the result.
                if not state.done then
                    state.done = true
                    resolve(promise, state.deferred)
                end if
            end if
        end for
    else
        ' We can't resolve with a promise if there are no promises to resolve
        try
            throw {
                message: "All promises were rejected"
                errors: []
            }
        catch e
            reject(e, deferred)
        end try
    end if
    return deferred
end function

' Takes an array of promises as input and returns a single Promise.
' This returned promise settles with the eventual state of the first promise that settles.
function race(promiseArray as dynamic) as dynamic
    ' Create a deferred to be resolved later
    deferred = create()
    if type(promiseArray) = "roArray" and not promiseArray.isEmpty() then
        ' Track the state and results of all the promises
        state = {
            deferred: deferred
            done: false
        }
        for i = 0 to promiseArray.count() - 1
            promise = promiseArray[i]
            if isPromise(promise) then
                if promise.promiseState = "resolved" then
                    ' Do not process any promises that come in after the first resolved one
                    if not state.done then
                        state.done = true
                        resolve(promise.promiseResult, state.deferred)
                    end if
                else if promise.promiseState = "rejected" then
                    ' Do not process any promises that come in after the first resolved one
                    if not state.done then
                        state.done = true
                        reject(promise.promiseResult, state.deferred)
                    end if
                else
                    ' Watch for both resolved or rejected promises
                    onThen(promise, sub(result as dynamic, state as dynamic)
                        ' Do not process any promises that come in after the first resolved one
                        if not state.done then
                            state.done = true
                            resolve(result, state.deferred)
                        end if
                    end sub, state)
                    onCatch(promise, sub(error as dynamic, state as dynamic)
                        ' Do not process any promises that come in after the first resolved one
                        if not state.done then
                            state.done = true
                            reject(error, state.deferred)
                        end if
                    end sub, state)
                end if
            else
                ' The value in the promise array is not a promise.
                ' Immediately set the result.
                if not state.done then
                    state.done = true
                    resolve(promise, state.deferred)
                end if
            end if
        end for
    else
        ' We can't resolve with a promise if there are no promises to resolve
        try
            throw {
                message: "All promises were rejected"
                errors: []
            }
        catch e
            reject(e, deferred)
        end try
    end if
    return deferred
end function

function resolve(result as dynamic, promise = invalid as dynamic) as object
    if not isPromise(promise) then
        promise = create()
    end if
    if not isComplete(promise) then
        ' console.trace("[promises.resolve]", promise.id)
        if type(result) = "roAssociativeArray" then
            promise.removeField("promiseResult")
            promise.addFields({
                promiseResult: result
            })
        else
            promise.update({
                promiseResult: result
            }, true)
        end if
        promise.promiseState = "resolved"
    end if
    return promise
end function

function reject(error as dynamic, promise = invalid as dynamic) as object
    if not isPromise(promise) then
        promise = create()
    end if
    if not isComplete(promise) then
        ' console.trace("[promises.reject]", promise.id)
        if type(error) = "roAssociativeArray" then
            promise.removeField("promiseResult")
            promise.addFields({
                promiseResult: error
            })
        else
            promise.update({
                promiseResult: error
            }, true)
        end if
        promise.promiseState = "rejected"
    end if
    return promise
end function

function isComplete(promise as object) as boolean
    if not isPromise(promise) then
        return false
    end if
    state = promise.promiseState
    return state = "resolved" or state = "rejected"
end function

' Determines if the given item is a promise.
'
' Will return true if at least one of the following conditions are true:
' - the SubType exactly equals "Promise"
' - the subtype ends with "_promise" case insensitive
' - the node has a field called "promiseState"
function isPromise(promise as dynamic) as boolean
    if not type(promise) = "roSGNode" then
        return false
    end if
    subType = lCase(promise.subType())
    if subType.endsWith("_promise") then
        return true
    end if
    if subType = "promise" then
        return true
    end if
    while true
        subType = promise.parentSubtype(subType)
        if lCase(subType).endsWith("_promise") then
            return true
        end if
        if subType = "" then
            exit while
        end if
    end while
    return promise.hasField("promiseState")
end function

' Determines if the given node event was triggered on a promise like node.
function isPromiseEvent(event as dynamic) as boolean
    if not type(event) = "roSGNodeEvent" then
        return false
    end if
    return lCase(event.getField()) = "promisestate"
end function

' Remove all promise storage from the current m
sub clean()
    for each key in m
        if key.startsWith("__promises__") then
            m.delete(key)
        end if
    end for
end sub

'Allows chaining multiple promise operations in a row in a clean syntax
function chain(initialPromise as object, context = "__INVALID__" as object) as object
    return {
        _lastPromise: initialPromise
        _context: context
        then: function(callback = invalid as dynamic) as object
            if callback = invalid then
                callback = internal_defaultThenCallback
            end if
            m._lastPromise = onThen(m._lastPromise, callback, m._context)
            return m
        end function
        "catch": function(callback = invalid as dynamic) as object
            if callback = invalid then
                callback = internal_defaultCatchCallback
            end if
            m._lastPromise = onCatch(m._lastPromise, callback, m._context)
            return m
        end function
        finally: function(callback = invalid as dynamic) as object
            if callback = invalid then
                callback = internal_defaultFinallyCallback
            end if
            m._lastPromise = onFinally(m._lastPromise, callback, m._context)
            return m
        end function
        toPromise: function() as object
            return m._lastPromise
        end function
    }
end function

sub setMessagePort(port as dynamic)
    m.__promises__promisesPort = port
end sub

function getMessagePort() as dynamic
    return m.__promises__promisesPort
end function

' First, consume and process all promise events from the front of the queue.
' This method is similar to the GetMessage() method, but the returned object (if not invalid) remains in the message queue.
' A later call to WaitMessage(), GetMessage() or PeekMessage() will return the same message.
function peekMessage(port as dynamic) as dynamic
    while true
        message = port.peekMessage()
        'if this is a promise event, process it and peek again
        if isPromiseEvent(message) then
            'remove the message from the queue and process it
            message = port.getMessage()
            internal_notifyListeners(message)
            continue while
        end if
        return message
    end while
    return invalid
end function

' First, consume and process all promise events from the front of the queue.
' Then, if an event object is available, it is returned. Otherwise `invalid` is returned. The method returns immediately in either case and does not wait.
function getMessage(port as dynamic) as dynamic
    if peekMessage(port) <> invalid then
        return port.getMessage()
    end if
    return invalid
end function

' Same capabilities as the native `wait()` function, except that promise events are automatically processed and removed from its registered `roMessagePort` provided in `promises.setMessagePort()`.
function wait2(timeoutMilliseconds as dynamic, port as dynamic) as dynamic
    promisesPort = getMessagePort()
    'bs:disable-next-line
    utils = createObject("roUtils")
    portIsPromisesPort = false
    ' if the promise port is the same as the supplied port (and we can actually use roUtils to compare same-ness)
    if utils <> invalid and utils.isSameObject(port, promisesPort) then
        portIsPromisesPort = true
    end if
    timespan = createObject("roTimeSpan")
    while true
        currentDuration = timespan.TotalMilliseconds()
        'if we are not waiting indefinitely
        if timeoutMilliseconds > 0 then
            ' if the duration has exceeded the wait time, exit and return invalid
            if currentDuration >= timeoutMilliseconds then
                return invalid
                'the duration has not exceeded the wait time. compute how much time we have left
            else
                thisTickTimeout = timeoutMilliseconds - currentDuration
            end if
        else
            thisTickTimeout = timeoutMilliseconds
        end if
        'ensure we don't wait too long in a single tick (so promises still have time to resolve)
        'preserve true indefinite waits when waiting directly on the promises port
        if thisTickTimeout > 200 or (thisTickTimeout = 0 and not portIsPromisesPort) then
            thisTickTimeout = 200
        end if
        'if the port we're waiting on is the promises port, then no need for the double-latch
        if portIsPromisesPort then
            event = wait(thisTickTimeout, port)
            if isPromiseEvent(event) then
                internal_notifyListeners(event)
                continue while
            end if
            return event
        else
            'flush all pending promises on the promise port
            messagePort = getMessagePort()
            if messagePort <> invalid then
                peekMessage(messagePort)
            end if
            'wait a little bit for an event on the supplied port
            event = wait(thisTickTimeout, port)
            'if the message was a promise event, handle it
            if isPromiseEvent(event) then
                internal_notifyListeners(event)
                continue while
            else
                'it's not a promise event! return it
                return event
            end if
        end if
    end while
    return invalid
end function

' Makes sure the value supplied is a promise
function ensurePromise(value as object) as object
    if isPromise(value) then
        return value
    end if
    return resolve(value)
end function


' Sets a global flag to enable or disable logging of crashes when calling callback functions
function configuration_enableCrashLogging(enabled as boolean) as boolean
    globalNode = m.global
    if type(globalNode) = "roSGNode" then
        if enabled then
            globalNode.update({
                __promises__crashLoggingEnabled: enabled
            }, true)
        else
            globalNode.removeField("__promises__crashLoggingEnabled")
        end if
        return true
    end if
    return false
end function



' Clear storage for a given promise
sub internal_clearPromiseStorage(promise as object, nodeEvent = invalid as dynamic)
    if nodeEvent <> invalid then
        id = "__promises__" + nodeEvent.getNode()
    else
        id = "__promises__" + promise.id
    end if
    m.delete(id)
end sub

function internal_getLibPath() as string
    path = m.__promises__LibPath
    if type(path) = "String" then
        return path
    end if
    try
        throw "Generating path to the promises library"
    catch error
        path = error.backtrace.peek().filename
    end try
    m.__promises__LibPath = path
    return path
end function

' Get the storage for a promise on `m`
function internal_getPromiseStorage(promise as object, nodeEvent = invalid as dynamic) as object
    if nodeEvent <> invalid then
        id = "__promises__" + nodeEvent.getNode()
    else
        id = "__promises__" + promise.id
    end if
    storage = m[id]
    ' Only create storage and register observers if it does not exist
    if storage = invalid then
        if m.__promises__promisesPort <> invalid then
            callback = m.__promises__promisesPort
        else
            callback = sub(event as dynamic)
                'run the notification nexttick to prevent stackoverflow due to cascading promises all resolving in sequence
                internal_delay(sub(context as dynamic)
                    internal_notifyListeners(context.event)
                end sub, {
                    event: event
                })
            end sub
        end if
        ' unregister any observers on the promise to prevent multiple callbacks
        internal_unobserveFieldScoped(promise, "promiseState")
        internal_observeFieldScoped(promise, "promiseState", callback, [
            "promiseResult"
        ])
        storage = {
            promise: promise
            thenListeners: []
            catchListeners: []
            finallyListeners: []
        }
        m[id] = storage
    end if
    return storage
end function

'
' Registers a listener for a promise for the then, catch, or finally events
' @param eventName - should be "then", "catch", or "finally"
'
function internal_on(eventName as string, promise as dynamic, callback as Function, context = {} as object) as dynamic
    if isPromise(promise) then
        registrationLocation = invalid
        newPromise = create()
        storage = internal_getPromiseStorage(promise)
        storage[eventName + "Listeners"].push({
            callback: callback
            context: context
            promise: newPromise
            registrationLocation: registrationLocation
        })
        promiseState = promise.promiseState
        'trigger a change if the promise is already resolved
        if promiseState = "resolved" or promiseState = "rejected" then
            if m.__promises__promisesPort <> invalid then
                promise.promiseState = promiseState
            else
                internal_delay(sub(details as object)
                    details.promise.promiseState = details.promiseState
                end sub, {
                    promise: promise
                    promiseState: promiseState
                })
            end if
        end if
        return newPromise
    end if
    errorMessage = "Cannot register promises." + eventName + " for non-promise"
    throw errorMessage
    return invalid
end function

'
' Notify all the listeners of a promise that it has been completed
'
sub internal_notifyListeners(event as object)
    originalPromise = event.getRoSgNode()
    ' short circuit if the promise is not complete, since we only want to notify listeners once
    if not isComplete(originalPromise) then
        return
    end if
    ' We want to make sure that if a new listener is added while we are processing the current listeners, that it also gets notified of the current state change.
    ' Doing the while loop here supports handing new observers that are added in the callbacks.
    while internal_hasStorage(originalPromise)
        ' unregister any observers once the promise is completed
        internal_unobserveFieldScoped(originalPromise, "promiseState")
        promiseStorage = internal_getPromiseStorage(originalPromise, event)
        ' Delete the storage for this promise since we are going to handled all of the current listeners.
        ' Any new listeners created as a result of the logic in the callbacks will
        ' register a new instance of the promise storage item. If a new storage item is created
        ' we will notify the new listeners when we are done with the current ones.
        internal_clearPromiseStorage(originalPromise, event)
        promiseState = event.getData()
        promiseResult = event.getInfo().promiseResult
        'handle .then() listeners
        for each listener in promiseStorage.thenListeners
            internal_processPromiseListener(originalPromise, promiseState, listener, promiseState = "resolved", true, promiseResult)
        end for
        'handle .catch() listeners
        for each listener in promiseStorage.catchListeners
            internal_processPromiseListener(originalPromise, promiseState, listener, promiseState = "rejected", true, promiseResult)
        end for
        'handle .finally() listeners
        for each listener in promiseStorage.finallyListeners
            internal_processPromiseListener(originalPromise, promiseState, listener, true, false, promiseResult)
        end for
        ' if we're running in a task, we can keep notifying new listeners
        if m.__promises__promisesPort <> invalid then
            continue while
        else
            'we're not in a task, nexttick to avoid execution timeouts
            internal_delay(sub(event as object)
                internal_notifyListeners(event)
            end sub, event)
            exit while
        end if
    end while
end sub

' Used to check if there is a storage item of listeners for the supplied promise
function internal_hasStorage(promise as dynamic) as boolean
    return m.doesExist("__promises__" + promise.id)
end function

' We use an internal value to represent unset. Check if the parameter is that value
function internal_isSet(value as dynamic) as boolean
    return not (internal_isNonEmptyString(value) and value = "__INVALID__")
end function

' Is the supplied value a valid String type and is not empty
' @param value - The variable to be checked
' @return true if value is a non-empty string, false otherwise
function internal_isNonEmptyString(value as dynamic) as boolean
    return (type(value) = "String" or type(value) = "roString") and value <> ""
end function

' Handle an individual promise listener
sub internal_processPromiseListener(originalPromise as object, originalPromiseState as string, storageItem as object, callCallback as boolean, isThenOrCatch as boolean, promiseValue = invalid as dynamic)
    newPromise = storageItem.promise
    callback = storageItem.callback
    context = storageItem.context
    hasContext = internal_isSet(context)
    'only call the callback if configured to do so
    if callCallback then
        lineNumber = -1
        try
            '.then and .catch take one or two parameters (`promiseValue` and optional `context`)
            if isThenOrCatch then
                if hasContext then
                    try
                        lineNumber = LINE_NUM + 1
                        callbackResult = callback(promiseValue, context)
                    catch error
                        file = error.backtrace.peek()
                        if error.number = 241 and file.filename = internal_getLibPath() and file.line_number = lineNumber then
                            print "[promises.error]: " internal_formatStackTrace(error, "Wrong number of parameters in promise callback. We have recovered, but this should be fixed as performance will suffer.")
                            callbackResult = callback(promiseValue)
                        else
                            internal_logCrashIfEnabled(error)
                            callbackResult = reject(error)
                        end if
                    end try
                else
                    try
                        lineNumber = LINE_NUM + 1
                        callbackResult = callback(promiseValue)
                    catch error
                        file = error.backtrace.peek()
                        if error.number = 241 and file.filename = internal_getLibPath() and file.line_number = lineNumber then
                            print "[promises.error]: " internal_formatStackTrace(error, "Wrong number of parameters in promise callback. We have recovered, but this should be fixed as performance will suffer.")
                            callbackResult = callback(promiseValue, 0) ' 0 works for numbers, boolean, object, dynamic. (does not work for string or function, but those are uncommon)
                        else
                            internal_logCrashIfEnabled(error)
                            callbackResult = reject(error)
                        end if
                    end try
                end if
                '.finally callback takes 1 optional parameter (`context`)
            else
                if hasContext then
                    try
                        lineNumber = LINE_NUM + 1
                        callbackResult = callback(context)
                    catch error
                        file = error.backtrace.peek()
                        if error.number = 241 and file.filename = internal_getLibPath() and file.line_number = lineNumber then
                            print "[promises.error]: " internal_formatStackTrace(error, "Wrong number of parameters in promise callback. We have recovered, but this should be fixed as performance will suffer.")
                            callbackResult = callback()
                        else
                            internal_logCrashIfEnabled(error)
                            callbackResult = reject(error)
                        end if
                    end try
                else
                    try
                        lineNumber = LINE_NUM + 1
                        callbackResult = callback()
                    catch error
                        file = error.backtrace.peek()
                        if error.number = 241 and file.filename = internal_getLibPath() and file.line_number = lineNumber then
                            print "[promises.error]: " internal_formatStackTrace(error, "Wrong number of parameters in promise callback. We have recovered, but this should be fixed as performance will suffer.")
                            callbackResult = callback(0) ' 0 works for numbers, boolean, object, dynamic. (does not work for string or function, but those are uncommon)
                        else
                            internal_logCrashIfEnabled(error)
                            callbackResult = reject(error)
                        end if
                    end try
                end if
            end if
        catch e
            internal_logCrashIfEnabled(e)
            'the result is a rejected promise
            callbackResult = reject(e)
        end try
    else
        'use the current promise value to pass to the next promise (this is a .catch handler)
        if originalPromiseState = "rejected" then
            callbackResult = reject(promiseValue)
        else
            callbackResult = promiseValue
        end if
    end if
    if isThenOrCatch then
        'if the .then() callback returned a promise. wait for it to resolve and THEN resolve the newPromise
        if isPromise(callbackResult) then
            callbackPromise = callbackResult
            'wait for the callback promise to complete
            onFinally(callbackPromise, sub(context as object)
                promiseState = context.callbackPromise.promiseState
                promiseResult = context.callbackPromise.promiseResult
                if promiseState = "resolved" then
                    'the callback promise is complete. resolve the newPromise
                    resolve(promiseResult, context.newPromise)
                    return
                end if
                if promiseState = "rejected" then
                    reject(promiseResult, context.newPromise)
                    return
                end if
            end sub, {
                newPromise: newPromise
                callbackPromise: callbackPromise
            })
            'the .then() callback returned a non-promise. Resolve the newPromise immediately with this value
        else
            resolve(callbackResult, newPromise)
        end if
    else
        ' This is a .finally() block
        if isPromise(callbackResult) then
            callbackPromise = callbackResult
            context = {
                newPromise: newPromise
                originalPromise: originalPromise
                originalPromiseState: originalPromiseState
                originalPromiseResult: promiseValue
            }
            onThen(callbackPromise, sub(result as dynamic, context as dynamic)
                if context.originalPromiseState = "resolved" then
                    resolve(context.originalPromiseResult, context.newPromise)
                else
                    reject(context.originalPromiseResult, context.newPromise)
                end if
            end sub, context)
            onCatch(callbackPromise, sub(error as dynamic, context as dynamic)
                reject(error, context.newPromise)
            end sub, context)
        else
            if originalPromiseState = "resolved" then
                resolve(promiseValue, newPromise)
            else
                reject(promiseValue, newPromise)
            end if
        end if
    end if
end sub

function internal_defaultThenCallback(value = invalid as dynamic, _ = invalid as dynamic) as dynamic
    return value
end function

function internal_defaultCatchCallback(value = invalid as dynamic, _ = invalid as dynamic) as dynamic
    return reject(value)
end function

sub internal_defaultFinallyCallback(_ = invalid as dynamic)
end sub

'
' Generates a new UUID
'
function internal_createUuid() as string
    if m.__promises__deviceInfo = invalid then
        m.__promises__deviceInfo = createObject("roDeviceInfo")
    end if
    return m.__promises__deviceInfo.getRandomUUID()
end function

' Makes a delayed call to the supplied function. Default behavior is essentially next tick.
' @param {Function} callback - The function to be called after a set delay
' @param {Dynamic} context - a single item of data to be passed into the callback when invoked
' @param {Float} [duration] - the amount of delay before invoking the callback
sub internal_delay(callback as Function, context as dynamic, duration = 0.0001 as float)
    timer = createObject("roSGNode", "Timer")
    timer.update({
        duration: duration
        repeat: false
        id: "__delay_" + internal_createUuid()
    }, true)
    m[timer.id] = {
        timer: timer
        callback: callback
        context: context
    }
    internal_observeFieldScoped(timer, "fire", sub(event as object)
        internal_unobserveFieldScoped(event.getRosgNode(), "fire")
        delayId = event.getNode()
        options = m[delayId]
        callback = options.callback
        try
            callback(options.context)
        catch e
            internal_logCrashIfEnabled(e)
        end try
        m.delete(delayId)
    end sub)
    timer.control = "start"
end sub

' Observes a node field using observeFieldScoped
' @param {roSGNode} node - The node to apply the observer
' @param {String} field - The name of the field to be monitored.
' @param {Dynamic} callback - The name or message port to be executed when the value of the field changes.
' @return true if field could be observed, false if not
function internal_observeFieldScoped(node as object, field as string, callback as dynamic, infoFields = [] as object) as boolean
    if not type(node) = "roSGNode" then
        return false
    else
        if type(callback) = "roFunction" or type(callback) = "Function" then
            callback = callback.toStr().tokenize(" ").peek()
        end if
        if not node.observeFieldScoped(field, callback, infoFields) then
            return false
        end if
    end if
    return true
end function

' Unobserve a node field using unobserveFieldScoped
' @param {roSGNode} node - The node to remove the observer from
' @param {String} field - The name of the field to no longer be monitored.
' @return true if field could be unobserved, false if not
function internal_unobserveFieldScoped(node as object, field as string) as boolean
    if not type(node) = "roSGNode" then
        return false
    else
        if not node.unobserveFieldScoped(field) then
            return false
        end if
    end if
    return true
end function

' Calls the supplied function with the supplied arguments
' @param {Function} callback - The function to be called
' @param {dynamic} args - The arguments to pass to the callback. Max 32 arguments.
' @return {dynamic} The result of the callback
function internal_callWithArgs(callback as Function, args = invalid as dynamic) as dynamic
    if type(args) = "roArray" then
        argsCount = args.count()
        if argsCount < 16 then ' 0-15 args
            if argsCount < 8 then ' 0-7 args
                if argsCount < 4 then ' 0-3 args
                    if argsCount < 2 then ' 0-1 args
                        if argsCount = 0 then ' 0 args
                            result = callback()
                        else ' 1 arg
                            result = callback(args[0])
                        end if
                    else ' 2-3 args
                        if argsCount = 2 then ' 2 args
                            result = callback(args[0], args[1])
                        else ' 3 args
                            result = callback(args[0], args[1], args[2])
                        end if
                    end if
                else ' 4-7 args
                    if argsCount < 6 then
                        if argsCount = 4 then ' 4 args
                            result = callback(args[0], args[1], args[2], args[3])
                        else ' 5 args
                            result = callback(args[0], args[1], args[2], args[3], args[4])
                        end if
                    else ' 6-7 args
                        if argsCount = 6 then ' 6 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5])
                        else ' 7 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
                        end if
                    end if
                end if
            else ' 8-15 args
                if argsCount < 12 then ' 8-11 args
                    if argsCount < 10 then ' 8-9 args
                        if argsCount = 8 then ' 8 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7])
                        else ' 9 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8])
                        end if
                    else ' 10-11 args
                        if argsCount = 10 then ' 10 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9])
                        else ' 11 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10])
                        end if
                    end if
                else ' 12-15 args
                    if argsCount < 14 then ' 12-13 args
                        if argsCount = 12 then ' 12 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11])
                        else ' 13 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12])
                        end if
                    else ' 14-15 args
                        if argsCount = 14 then ' 14 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13])
                        else ' 15 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14])
                        end if
                    end if
                end if
            end if
        else ' 16-32 args
            if argsCount < 24 then ' 16-23 args
                if argsCount < 20 then ' 16-19 args
                    if argsCount < 18 then ' 16-17 args
                        if argsCount = 16 then ' 16 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15])
                        else ' 17 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16])
                        end if
                    else ' 18-19 args
                        if argsCount = 18 then ' 18 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17])
                        else ' 19 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18])
                        end if
                    end if
                else ' 20-23 args
                    if argsCount < 22 then ' 20-21 args
                        if argsCount = 20 then ' 20 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19])
                        else ' 21 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20])
                        end if
                    else ' 22-23 args
                        if argsCount = 22 then ' 22 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21])
                        else ' 23 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22])
                        end if
                    end if
                end if
            else ' 24-32 args
                if argsCount < 28 then ' 24-27 args
                    if argsCount < 26 then ' 24-25 args
                        if argsCount = 24 then ' 24 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23])
                        else ' 25 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24])
                        end if
                    else ' 26-27 args
                        if argsCount = 26 then ' 26 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25])
                        else ' 27 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26])
                        end if
                    end if
                else ' 28-32 args
                    if argsCount < 30 then ' 28-29 args
                        if argsCount = 28 then ' 28 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27])
                        else ' 29 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27], args[28])
                        end if
                    else ' 30-32 args
                        if argsCount = 30 then ' 30 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27], args[28], args[29])
                        else if argsCount = 31 then ' 31 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27], args[28], args[29], args[30])
                        else ' 32 args
                            result = callback(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11], args[12], args[13], args[14], args[15], args[16], args[17], args[18], args[19], args[20], args[21], args[22], args[23], args[24], args[25], args[26], args[27], args[28], args[29], args[30], args[31])
                        end if
                    end if
                end if
            end if
        end if
    else
        result = callback()
    end if
    return result
end function


' Returns a string representation of the stack trace
' example:
'    Error: some error
'        $anon_6c() As Dynamic (pkg:/source/FailedAssertion.spec.brs:11)
'        $anon_303() As Dynamic (pkg:/source/rooibos/Test.brs:45)
'        $anon_1f2(test As Object) As Dynamic (pkg:/source/rooibos/BaseTestSuite.brs:243)
'        $anon_30a() As Dynamic (pkg:/source/rooibos/TestGroup.brs:88)
'        $anon_309() As Dynamic (pkg:/source/rooibos/TestGroup.brs:68)
'        $anon_1ec() As Dynamic (pkg:/source/rooibos/BaseTestSuite.brs:131)
'        $anon_1eb() As Dynamic (pkg:/source/rooibos/BaseTestSuite.brs:121)
'        $anon_325(testsuite As Dynamic) As Void (pkg:/source/rooibos/TestRunner.brs:191)
'        $anon_322() As Dynamic (pkg:/source/rooibos/TestRunner.brs:72)
'        rooibos_init(testscenename As Dynamic) As Void (pkg:/source/rooibos/Rooibos.brs:27)
'        main(args As Dynamic) As Dynamic (pkg:/source/Main.brs:2)
function internal_formatStackTrace(error as dynamic, message as string) as string
    output = message + chr(10)
    indent = string(6, " ")
    for i = error.backTrace.count() - 1 to 0 step -1
        e = error.backTrace[i]
        output += indent + e["function"] + " (" + e.filename.trim() + ":" + e.line_number.toStr() + ")" + chr(10)
    end for
    return output
end function

' Log the error if crash logging is enabled
sub internal_logCrashIfEnabled(error as dynamic)
    ' Filter out user defined errors
    if error.number = 40 then
        return
    end if
    logCrashes = m.global?.__promises__crashLoggingEnabled
    if type(logCrashes) <> "roBoolean" then
        logCrashes = false
    end if
    if logCrashes then
        print "[promises.error]: " internal_formatStackTrace(error, error.message)
    end if
end sub
'//# sourceMappingURL=./promises.brs.map