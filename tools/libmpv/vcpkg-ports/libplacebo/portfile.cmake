vcpkg_check_linkage(ONLY_DYNAMIC_LIBRARY)

set(LIBPLACEBO_REPO "https://github.com/haasn/libplacebo.git")
set(LIBPLACEBO_TAG "v7.360.1")

if(DEFINED ENV{LIBPLACEBO_REPO} AND NOT "$ENV{LIBPLACEBO_REPO}" STREQUAL "")
    set(LIBPLACEBO_REPO "$ENV{LIBPLACEBO_REPO}")
endif()

if(DEFINED ENV{LIBPLACEBO_TAG} AND NOT "$ENV{LIBPLACEBO_TAG}" STREQUAL "")
    set(LIBPLACEBO_TAG "$ENV{LIBPLACEBO_TAG}")
endif()

if(DEFINED ENV{LIBPLACEBO_REF} AND NOT "$ENV{LIBPLACEBO_REF}" STREQUAL "")
    if("$ENV{LIBPLACEBO_REF}" MATCHES "^refs/tags/")
        string(REGEX REPLACE "^refs/tags/" "" LIBPLACEBO_TAG "$ENV{LIBPLACEBO_REF}")
    else()
        set(LIBPLACEBO_TAG "$ENV{LIBPLACEBO_REF}")
    endif()
endif()

message(STATUS "Using libplacebo source: ${LIBPLACEBO_REPO} @ ${LIBPLACEBO_TAG}")

vcpkg_find_acquire_program(GIT)
set(SOURCE_PATH "${CURRENT_BUILDTREES_DIR}/src/${PORT}-${TARGET_TRIPLET}")
file(REMOVE_RECURSE "${SOURCE_PATH}")

vcpkg_execute_required_process(
    COMMAND "${GIT}" clone "${LIBPLACEBO_REPO}" "${SOURCE_PATH}"
    WORKING_DIRECTORY "${CURRENT_BUILDTREES_DIR}"
    LOGNAME "git-clone-${TARGET_TRIPLET}"
)

vcpkg_execute_required_process(
    COMMAND "${GIT}" -C "${SOURCE_PATH}" checkout "${LIBPLACEBO_TAG}"
    WORKING_DIRECTORY "${CURRENT_BUILDTREES_DIR}"
    LOGNAME "git-checkout-${TARGET_TRIPLET}"
)

execute_process(
    COMMAND "${GIT}" -C "${SOURCE_PATH}" describe --tags --exact-match
    RESULT_VARIABLE _tag_check_result
    OUTPUT_VARIABLE _tag_check_output
    ERROR_VARIABLE _tag_check_error
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_STRIP_TRAILING_WHITESPACE
)
if(NOT _tag_check_result EQUAL 0 OR NOT _tag_check_output STREQUAL "${LIBPLACEBO_TAG}")
    message(FATAL_ERROR
        "Expected libplacebo tag '${LIBPLACEBO_TAG}', but got '${_tag_check_output}'. "
        "git describe stderr: ${_tag_check_error}"
    )
endif()

vcpkg_execute_required_process(
    COMMAND "${GIT}" -C "${SOURCE_PATH}" submodule update --init --recursive
    WORKING_DIRECTORY "${CURRENT_BUILDTREES_DIR}"
    LOGNAME "git-submodule-${TARGET_TRIPLET}"
)

vcpkg_configure_meson(
    SOURCE_PATH "${SOURCE_PATH}"
    OPTIONS
        "-Dc_args=-I${SOURCE_PATH}/3rdparty/Vulkan-Headers/include"
        "-Dcpp_args=-I${SOURCE_PATH}/3rdparty/Vulkan-Headers/include"
        -Dopengl=disabled
        -Dvulkan=enabled
        -Dvk-proc-addr=enabled
        -Dshaderc=enabled
        -Ddemos=false
        -Dtests=false
        -Dbench=false
        -Dfuzz=false
)

vcpkg_install_meson()
vcpkg_fixup_pkgconfig()
vcpkg_copy_pdbs()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/share")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/share/pkgconfig")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/share/pkgconfig")

if(EXISTS "${SOURCE_PATH}/LICENSE")
    file(INSTALL "${SOURCE_PATH}/LICENSE" DESTINATION "${CURRENT_PACKAGES_DIR}/share/${PORT}" RENAME copyright)
elseif(EXISTS "${SOURCE_PATH}/COPYING")
    file(INSTALL "${SOURCE_PATH}/COPYING" DESTINATION "${CURRENT_PACKAGES_DIR}/share/${PORT}" RENAME copyright)
else()
    message(FATAL_ERROR "Could not find libplacebo license file in source tree.")
endif()
